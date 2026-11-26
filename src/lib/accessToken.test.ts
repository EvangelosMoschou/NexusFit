import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accessControlConfigured,
  signAccessToken,
  verifyAccessDeviceKey,
  verifyAccessToken,
} from "./accessToken";
import { hashPinSync } from "./passwordHash";

const SECRET = "test-session-secret-value-1234";
const DEVICE_KEY = "test-access-device-key-1234";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("access tokens", () => {
  it("signs and verifies a tenant-bound token", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const issued = signAccessToken("default", "mem-8492");
    expect(issued).not.toBeNull();
    expect(verifyAccessToken(issued!.token, "default")?.memberId).toBe("mem-8492");
    expect(verifyAccessToken(issued!.token, "gym-b")).toBeNull();
  });

  it("rejects tampering and expired tokens", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const issued = signAccessToken("default", "mem-8492")!;
    expect(verifyAccessToken(`${issued.token}x`, "default")).toBeNull();

    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now + 91_000));
    expect(verifyAccessToken(issued.token, "default")).toBeNull();
  });

  it("requires a configured device key", () => {
    vi.stubEnv("ACCESS_CONTROL_KEY", DEVICE_KEY);
    expect(accessControlConfigured()).toBe(true);
    expect(verifyAccessDeviceKey(DEVICE_KEY)).toBe(true);
    expect(verifyAccessDeviceKey("wrong-key")).toBe(false);
    expect(verifyAccessDeviceKey(undefined)).toBe(false);

    vi.stubEnv("ACCESS_CONTROL_KEY", "");
    expect(accessControlConfigured()).toBe(false);
    expect(verifyAccessDeviceKey(DEVICE_KEY)).toBe(false);
  });

  it("supports per-tenant sha256 and scrypt access key hashes before env fallback", () => {
    vi.stubEnv("ACCESS_CONTROL_KEY", "global-fallback-key-123456");

    const tenantSha = `sha256:${createHash("sha256").update("tenant-turnstile-secret-1").digest("hex")}`;
    expect(accessControlConfigured(tenantSha)).toBe(true);
    expect(verifyAccessDeviceKey("tenant-turnstile-secret-1", tenantSha)).toBe(true);
    expect(verifyAccessDeviceKey("global-fallback-key-123456", tenantSha)).toBe(false);

    const tenantScrypt = hashPinSync("tenant-turnstile-scrypt-1");
    expect(accessControlConfigured(tenantScrypt)).toBe(true);
    expect(verifyAccessDeviceKey("tenant-turnstile-scrypt-1", tenantScrypt)).toBe(true);
    expect(verifyAccessDeviceKey("wrong-secret", tenantScrypt)).toBe(false);
  });
});
