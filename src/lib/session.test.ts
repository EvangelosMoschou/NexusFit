import { afterEach, describe, expect, it, vi } from "vitest";
import { signMemberSession, verifyMemberSession } from "./session";

const SECRET = "test-session-secret-value-1234";
const TENANT = "default";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("member session signing", () => {
  it("round-trips a signed member id for its tenant", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession(TENANT, "mem-8492");

    expect(token).toBeTruthy();
    expect(verifyMemberSession(token!, TENANT)).toBe("mem-8492");
  });

  it("rejects a session minted for another tenant", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession("gym-a", "mem-8492")!;

    expect(verifyMemberSession(token, "gym-b")).toBeNull();
    expect(verifyMemberSession(token, "gym-a")).toBe("mem-8492");
  });

  it("rejects a raw, unsigned member id", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(verifyMemberSession("mem-8492", TENANT)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession(TENANT, "mem-8492")!;
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

    expect(verifyMemberSession(tampered, TENANT)).toBeNull();
  });

  it("rejects a signature produced with a different secret", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession(TENANT, "mem-8492")!;

    vi.stubEnv("SESSION_SECRET", "a-completely-different-secret-99");
    expect(verifyMemberSession(token, TENANT)).toBeNull();
  });

  it("rejects swapping the member id while keeping the old signature", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession(TENANT, "mem-8492")!;
    const forgedPayload = Buffer.from(`${TENANT}:mem-0001`, "utf8").toString("base64url");
    const forged = `${forgedPayload}${token.slice(token.lastIndexOf("."))}`;

    expect(verifyMemberSession(forged, TENANT)).toBeNull();
  });

  it("refuses to sign in production without a configured secret", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(signMemberSession(TENANT, "mem-8492")).toBeNull();
    expect(verifyMemberSession("x.y", TENANT)).toBeNull();
  });

  it("rejects an empty or malformed cookie value", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(verifyMemberSession(undefined, TENANT)).toBeNull();
    expect(verifyMemberSession("", TENANT)).toBeNull();
    expect(verifyMemberSession("no-separator", TENANT)).toBeNull();
    expect(verifyMemberSession(".deadbeef", TENANT)).toBeNull();
  });
});
