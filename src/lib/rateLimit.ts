const buckets = new Map<string, { count: number; resetAt: number }>();

// Bounds so a long-running server cannot grow this map without limit: expired
// buckets are pruned periodically, and if the map still exceeds the cap (e.g. a
// flood from many IPs inside one window) the oldest entries are evicted, since a
// Map preserves insertion order.
const MAX_BUCKETS = 10_000;
const PRUNE_INTERVAL_MS = 60_000;
let lastPruneAt = 0;

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

function enforceBound(now: number): void {
  if (buckets.size < MAX_BUCKETS && now - lastPruneAt < PRUNE_INTERVAL_MS) return;

  lastPruneAt = now;
  pruneExpiredBuckets(now);

  if (buckets.size >= MAX_BUCKETS) {
    let overflow = buckets.size - MAX_BUCKETS + 1;
    for (const key of buckets.keys()) {
      if (overflow-- <= 0) break;
      buckets.delete(key);
    }
  }
}

// Exposed for tests and monitoring (bucket count must stay bounded).
export function rateLimitBucketCount(): number {
  return buckets.size;
}

export function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 60000
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  enforceBound(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;
  const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
  return { allowed, retryAfterSeconds };
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
