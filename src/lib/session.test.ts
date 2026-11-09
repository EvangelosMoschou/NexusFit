import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseMemberSession,
  parseStaffSession,
  signMemberSession,
  signStaffSession,
  signTrainerSession,
  verifyStaffSession,
  verifyTrainerSession,
} from "./session";

const SECRET = "test-session-secret-value-1234";
const TENANT = "default";
const TRAINER_HASH = "scrypt:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbb";
const STAFF_HASH = "scrypt:cccccccccccccccccccccccccccccccc:dddddddddddddddd";
const SESSION_ID = "member-session-id-123";

function futureExpiry(ms = 60_000): number {
  return Date.now() + ms;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("member session signing", () => {
  it("round-trips a signed member id, session id and expiry for its tenant", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const expiresAt = futureExpiry();
    const token = signMemberSession(TENANT, "mem-8492", SESSION_ID, expiresAt);

    expect(token).toBeTruthy();
    expect(parseMemberSession(token!, TENANT)).toEqual({
      memberId: "mem-8492",
      sessionId: SESSION_ID,
      expiresAt,
    });
  });

  it("rejects a session minted for another tenant", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession("gym-a", "mem-8492", SESSION_ID, futureExpiry())!;

    expect(parseMemberSession(token, "gym-b")).toBeNull();
    expect(parseMemberSession(token, "gym-a")).toEqual({
      memberId: "mem-8492",
      sessionId: SESSION_ID,
      expiresAt: expect.any(Number),
    });
  });

  it("rejects a raw, unsigned member id", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(parseMemberSession("mem-8492", TENANT)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession(TENANT, "mem-8492", SESSION_ID, futureExpiry())!;
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

    expect(parseMemberSession(tampered, TENANT)).toBeNull();
  });

  it("rejects a signature produced with a different secret", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession(TENANT, "mem-8492", SESSION_ID, futureExpiry())!;

    vi.stubEnv("SESSION_SECRET", "a-completely-different-secret-99");
    expect(parseMemberSession(token, TENANT)).toBeNull();
  });

  it("rejects swapping the member id while keeping the old signature", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const expiresAt = futureExpiry();
    const token = signMemberSession(TENANT, "mem-8492", SESSION_ID, expiresAt)!;
    const forgedPayload = Buffer.from(
      JSON.stringify({
        v: 1,
        t: TENANT,
        m: "mem-0001",
        s: SESSION_ID,
        e: expiresAt,
      }),
      "utf8"
    ).toString("base64url");
    const forged = `${forgedPayload}${token.slice(token.lastIndexOf("."))}`;

    expect(parseMemberSession(forged, TENANT)).toBeNull();
  });

  it("rejects an expired absolute session", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession(TENANT, "mem-8492", SESSION_ID, Date.now() - 1);

    expect(parseMemberSession(token!, TENANT)).toBeNull();
  });

  it("refuses to sign in production without a configured secret", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(signMemberSession(TENANT, "mem-8492", SESSION_ID, futureExpiry())).toBeNull();
    expect(parseMemberSession("x.y", TENANT)).toBeNull();
  });

  it("rejects an empty or malformed cookie value", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(parseMemberSession(undefined, TENANT)).toBeNull();
    expect(parseMemberSession("", TENANT)).toBeNull();
    expect(parseMemberSession("no-separator", TENANT)).toBeNull();
    expect(parseMemberSession(".deadbeef", TENANT)).toBeNull();
  });
});

describe("trainer session signing", () => {
  it("round-trips a trainer session for its tenant", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signTrainerSession(TENANT, TRAINER_HASH);
    expect(token).toBeTruthy();
    expect(verifyTrainerSession(token!, TENANT, TRAINER_HASH)).toBe(true);
  });

  it("rejects a trainer session for another tenant", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signTrainerSession("gym-a", TRAINER_HASH)!;
    expect(verifyTrainerSession(token, "gym-b", TRAINER_HASH)).toBe(false);
    expect(verifyTrainerSession(token, "gym-a", TRAINER_HASH)).toBe(true);
  });

  it("invalidates trainer sessions when the password hash changes", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signTrainerSession(TENANT, TRAINER_HASH)!;
    expect(verifyTrainerSession(token, TENANT, "scrypt:rotated:hash")).toBe(false);
  });

  it("does not accept a member session as a trainer session", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signMemberSession(TENANT, "mem-8492", SESSION_ID, futureExpiry())!;
    expect(verifyTrainerSession(token, TENANT, TRAINER_HASH)).toBe(false);
  });

  it("does not accept a trainer session as a member session", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signTrainerSession(TENANT, TRAINER_HASH)!;
    expect(parseMemberSession(token, TENANT)).toBeNull();
    // Even if a registry somehow contained the "@trainer" id.
    expect(parseMemberSession(token, "@trainer")).toBeNull();
  });

  it("refuses to sign in production without a configured secret", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(signTrainerSession(TENANT, TRAINER_HASH)).toBeNull();
  });
});

describe("staff session signing", () => {
  it("round-trips and parses a staff session", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signStaffSession(TENANT, "staff-123", STAFF_HASH);
    expect(token).toBeTruthy();
    expect(parseStaffSession(token!)).toEqual({ tenantId: TENANT, staffId: "staff-123" });
    expect(verifyStaffSession(token!, TENANT, "staff-123", STAFF_HASH)).toBe(true);
  });

  it("rejects another tenant, staff id or rotated password hash", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signStaffSession(TENANT, "staff-123", STAFF_HASH)!;
    expect(verifyStaffSession(token, "gym-b", "staff-123", STAFF_HASH)).toBe(false);
    expect(verifyStaffSession(token, TENANT, "staff-999", STAFF_HASH)).toBe(false);
    expect(verifyStaffSession(token, TENANT, "staff-123", "scrypt:rotated:hash")).toBe(false);
  });

  it("does not accept member or trainer tokens as staff", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const memberToken = signMemberSession(TENANT, "mem-8492", SESSION_ID, futureExpiry())!;
    const trainerToken = signTrainerSession(TENANT, TRAINER_HASH)!;
    expect(verifyStaffSession(memberToken, TENANT, "staff-123", STAFF_HASH)).toBe(false);
    expect(verifyStaffSession(trainerToken, TENANT, "staff-123", STAFF_HASH)).toBe(false);
  });

  it("does not accept a staff token as a member or trainer", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const staffToken = signStaffSession(TENANT, "staff-123", STAFF_HASH)!;
    expect(parseMemberSession(staffToken, TENANT)).toBeNull();
    expect(verifyTrainerSession(staffToken, TENANT, TRAINER_HASH)).toBe(false);
  });
});
