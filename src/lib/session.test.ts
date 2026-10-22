import { afterEach, describe, expect, it, vi } from "vitest";
import { signMemberId, verifyMemberSession } from "./session";

const SECRET = "test-session-secret-value-1234";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("member session signing", () => {
  it("round-trips a signed member id", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberId("mem-8492");

    expect(token).toBeTruthy();
    expect(verifyMemberSession(token!)).toBe("mem-8492");
  });

  it("rejects a raw, unsigned member id", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(verifyMemberSession("mem-8492")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberId("mem-8492")!;
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

    expect(verifyMemberSession(tampered)).toBeNull();
  });

  it("rejects a signature produced with a different secret", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberId("mem-8492")!;

    vi.stubEnv("SESSION_SECRET", "a-completely-different-secret-99");
    expect(verifyMemberSession(token)).toBeNull();
  });

  it("rejects swapping the member id while keeping the old signature", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberId("mem-8492")!;
    const forged = "mem-0001" + token.slice(token.lastIndexOf("."));

    expect(verifyMemberSession(forged)).toBeNull();
  });

  it("refuses to sign in production without a configured secret", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(signMemberId("mem-8492")).toBeNull();
    expect(verifyMemberSession("mem-8492.deadbeef")).toBeNull();
  });

  it("rejects an empty or malformed cookie value", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(verifyMemberSession(undefined)).toBeNull();
    expect(verifyMemberSession("")).toBeNull();
    expect(verifyMemberSession("no-separator")).toBeNull();
  });
});
