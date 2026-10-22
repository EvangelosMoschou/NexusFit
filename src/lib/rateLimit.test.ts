import { describe, expect, it } from "vitest";
import { checkRateLimit, getClientIp, rateLimitBucketCount } from "./rateLimit";

describe("rate limiter", () => {
  it("allows requests up to the limit, then blocks within the window", () => {
    const key = `limit-${Date.now()}`;

    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    }

    const blocked = checkRateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets once the window has elapsed", async () => {
    const key = `reset-${Date.now()}`;

    expect(checkRateLimit(key, 1, 1).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 1).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(checkRateLimit(key, 1, 1).allowed).toBe(true);
  });

  it("keeps the bucket map bounded under many distinct keys", () => {
    // Flood well past the internal cap using a long window, so nothing has
    // expired and the hard-cap eviction (not the periodic prune) must be what
    // keeps the map bounded. Without a bound this grew by one entry per
    // distinct IP forever.
    for (let i = 0; i < 10_050; i++) {
      checkRateLimit(`flood-${i}`, 1, 60_000);
    }

    expect(rateLimitBucketCount()).toBeLessThanOrEqual(10_000);
  });

  it("never uses the unknown-IP bucket to block a real key", () => {
    expect(checkRateLimit("unknown", 10, 60_000).allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("uses the right-most forwarded address so clients cannot spoof it", () => {
    // A client sending its own X-Forwarded-For is appended to by our proxy, so
    // only the last entry is trustworthy.
    const spoofed = new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
    expect(getClientIp(spoofed)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip and then to unknown", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(getClientIp(new Headers())).toBe("unknown");
  });

  it("handles a single-entry forwarded header", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.5" }))).toBe("203.0.113.5");
  });
});
