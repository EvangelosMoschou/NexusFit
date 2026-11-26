interface Bucket {
  count: number;
  resetAt: number;
}

class BoundedBucketStore {
  private readonly buckets = new Map<string, Bucket>();
  private lastPruneAt = 0;

  constructor(private readonly maxBuckets: number) {}

  get size(): number {
    return this.buckets.size;
  }

  private pruneExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt < now) this.buckets.delete(key);
    }
  }

  private enforceBound(now: number): void {
    if (this.buckets.size < this.maxBuckets && now - this.lastPruneAt < PRUNE_INTERVAL_MS) return;

    this.lastPruneAt = now;
    this.pruneExpired(now);

    if (this.buckets.size >= this.maxBuckets) {
      let overflow = this.buckets.size - this.maxBuckets + 1;
      for (const key of this.buckets.keys()) {
        if (overflow-- <= 0) break;
        this.buckets.delete(key);
      }
    }
  }

  check(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    this.enforceBound(now);

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    bucket.count += 1;
    const allowed = bucket.count <= limit;
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed, retryAfterSeconds };
  }
}

// Separate IP and entity-identifier bucket maps so an identifier-flood attack
// cannot evict IP rate-limit buckets (or vice versa), while staying capped at 10,000 total.
const MAX_BUCKETS_PER_STORE = 5_000;
const PRUNE_INTERVAL_MS = 60_000;
const ipBuckets = new BoundedBucketStore(MAX_BUCKETS_PER_STORE);
const entityBuckets = new BoundedBucketStore(MAX_BUCKETS_PER_STORE);

function isEntityBucketKey(key: string): boolean {
  return key.includes(":id:") || key.includes(":email:") || key.includes(":member:");
}

// Exposed for tests and monitoring (bucket count must stay bounded).
export function rateLimitBucketCount(): number {
  return ipBuckets.size + entityBuckets.size;
}

export function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 60000
): { allowed: boolean; retryAfterSeconds: number } {
  const store = isEntityBucketKey(key) ? entityBuckets : ipBuckets;
  return store.check(key, limit, windowMs);
}

// Our reverse proxy appends the address it actually observed, so the right-most
// entry is the trustworthy one. Anything to its left is client-supplied and can
// be spoofed to bypass the per-IP rate limit.
export function getClientIp(headers: Headers): string {
  const forwarded = (headers.get("x-forwarded-for") ?? "").split(",");
  const nearestProxySeen = forwarded[forwarded.length - 1].trim();
  if (nearestProxySeen) return nearestProxySeen;
  return headers.get("x-real-ip") || "unknown";
}
