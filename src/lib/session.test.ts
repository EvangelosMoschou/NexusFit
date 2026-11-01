import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseStaffSession,
  signMemberSession,
  signStaffSession,
  signTrainerSession,
  verifyMemberSession,
  verifyStaffSession,
  verifyTrainerSession,
} from "./session";

const SECRET = "test-session-secret-value-1234";
const TENANT = "default";
const TRAINER_HASH = "scrypt:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbb";
const STAFF_HASH = "scrypt:cccccccccccccccccccccccccccccccc:dddddddddddddddd";

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
    const token = signMemberSession(TENANT, "mem-8492")!;
    expect(verifyTrainerSession(token, TENANT, TRAINER_HASH)).toBe(false);
  });

  it("does not accept a trainer session as a member session", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = signTrainerSession(TENANT, TRAINER_HASH)!;
    expect(verifyMemberSession(token, TENANT)).toBeNull();
    // Even if a registry somehow contained the "@trainer" id.
    expect(verifyMemberSession(token, "@trainer")).toBeNull();
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
    const memberToken = signMemberSession(TENANT, "mem-8492")!;
    const trainerToken = signTrainerSession(TENANT, TRAINER_HASH)!;
    expect(verifyStaffSession(memberToken, TENANT, "staff-123", STAFF_HASH)).toBe(false);
    expect(verifyStaffSession(trainerToken, TENANT, "staff-123", STAFF_HASH)).toBe(false);
  });

  it("does not accept a staff token as a member or trainer", () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const staffToken = signStaffSession(TENANT, "staff-123", STAFF_HASH)!;
    expect(verifyMemberSession(staffToken, TENANT)).toBeNull();
    expect(verifyTrainerSession(staffToken, TENANT, TRAINER_HASH)).toBe(false);
  });
});
