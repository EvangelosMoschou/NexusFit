import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { DEFAULT_SESSION_MAX_AGE_SECONDS } from "./cookies";
import { isDemoMode } from "./flags";

// Member sessions are signed with HMAC-SHA256. Without this, the cookie value
// was the raw member id (e.g. "mem-8492") which is guessable and forgeable.
const DEV_FALLBACK_SECRET = "nexusfit-dev-insecure-session-secret";
const DEMO_FALLBACK_SECRET = "nexusfit-demo-insecure-session-secret";

// Stable fallback so sessions survive a dev-server reload; production must
// configure a real secret (mirrors adminCredentialsConfigured() in adminAuth).
// Demo mode is a throwaway deployment and signs with a known secret so a
// one-variable demo works out of the box.
export function memberSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV !== "production") return DEV_FALLBACK_SECRET;
  if (isDemoMode()) return DEMO_FALLBACK_SECRET;
  return null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

// The signed payload carries the tenant, member id, random server-side session
// id and absolute expiry. The tenant prevents cross-gym replay; the session id
// is what makes revocation possible (the DB stores only its SHA-256 hash).
export interface MemberSessionToken {
  memberId: string;
  sessionId: string;
  expiresAt: number;
}

export function signMemberSession(
  tenantId: string,
  memberId: string,
  sessionId: string,
  expiresAt: number
): string | null {
  const secret = memberSessionSecret();
  if (!secret) return null;

  const payload = JSON.stringify({
    v: 1,
    t: tenantId,
    m: memberId,
    s: sessionId,
    e: expiresAt,
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function parseMemberSession(
  value: string | undefined,
  tenantId: string
): MemberSessionToken | null {
  const secret = memberSessionSecret();
  if (!secret || !value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), "hex");
  const expected = Buffer.from(sign(encoded, secret), "hex");

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  const token = payload as Record<string, unknown>;
  if (token.v !== 1 || token.t !== tenantId) return null;
  if (typeof token.m !== "string" || !token.m) return null;
  if (typeof token.s !== "string" || !token.s) return null;
  if (typeof token.e !== "number" || !Number.isFinite(token.e)) return null;
  if (token.e <= Date.now()) return null;

  return {
    memberId: token.m,
    sessionId: token.s,
    expiresAt: token.e,
  };
}

// Trainer sessions are a separate, tenant-bound role. They use the same secret
// but a distinct payload prefix, so a member cookie can never act as a trainer.
const TRAINER_ROLE = "@trainer";
const ADMIN_ROLE = "@admin";
const STAFF_ROLE = "@staff";
const STAFF_DEFAULT_TTL_MS = DEFAULT_SESSION_MAX_AGE_SECONDS * 1000;

export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

export interface StaffSessionTokenDetails {
  tenantId: string;
  sessionId: string;
  expiresAt: number;
}

export interface NamedStaffSessionDetails extends StaffSessionTokenDetails {
  staffId: string;
}

export interface IssuedStaffSessionToken {
  token: string;
  sessionId: string;
  expiresAt: number;
}

function scopedSessionKey(passwordHash: string): string | null {
  const secret = memberSessionSecret();
  if (!secret || !passwordHash) return null;
  return `${secret}:${passwordHash}`;
}

function verifySignedPayload(value: string | undefined, key: string): string | null {
  if (!key || !value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), "hex");
  const expected = Buffer.from(sign(encoded, key), "hex");

  if (expected.length === 0 || provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function issueScopedSession(
  role: typeof ADMIN_ROLE | typeof TRAINER_ROLE,
  tenantId: string,
  passwordHash: string,
  options?: { sessionId?: string; expiresAt?: number }
): IssuedStaffSessionToken | null {
  const key = scopedSessionKey(passwordHash);
  if (!key) return null;

  const sessionId = options?.sessionId ?? randomUUID();
  const expiresAt = options?.expiresAt ?? Date.now() + STAFF_DEFAULT_TTL_MS;
  const encoded = Buffer.from(
    `${role}:${tenantId}:${sessionId}:${expiresAt}`,
    "utf8"
  ).toString("base64url");
  return {
    token: `${encoded}.${sign(encoded, key)}`,
    sessionId,
    expiresAt,
  };
}

function parseScopedSession(
  role: typeof ADMIN_ROLE | typeof TRAINER_ROLE,
  value: string | undefined,
  tenantId: string,
  passwordHash: string
): StaffSessionTokenDetails | null {
  const key = scopedSessionKey(passwordHash);
  if (!key) return null;

  const payload = verifySignedPayload(value, key);
  if (!payload) return null;

  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== role || parts[1] !== tenantId) return null;

  const sessionId = parts[2];
  const expiresAt = Number(parts[3]);
  if (!sessionId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }
  return { tenantId, sessionId, expiresAt };
}

// Binding the signature to the current admin/trainer password hash means rotating
// the password invalidates every outstanding cookie immediately; the embedded
// session ID enables server-side revocation and expiry checks.
export function issueAdminSession(
  tenantId: string,
  passwordHash: string,
  options?: { sessionId?: string; expiresAt?: number }
): IssuedStaffSessionToken | null {
  return issueScopedSession(ADMIN_ROLE, tenantId, passwordHash, options);
}

export function signAdminSession(
  tenantId: string,
  passwordHash: string,
  sessionId?: string,
  expiresAt?: number
): string | null {
  return issueAdminSession(tenantId, passwordHash, { sessionId, expiresAt })?.token ?? null;
}

export function verifyAdminSession(
  value: string | undefined,
  tenantId: string,
  passwordHash: string
): StaffSessionTokenDetails | null {
  return parseScopedSession(ADMIN_ROLE, value, tenantId, passwordHash);
}

export function issueTrainerSession(
  tenantId: string,
  passwordHash: string,
  options?: { sessionId?: string; expiresAt?: number }
): IssuedStaffSessionToken | null {
  return issueScopedSession(TRAINER_ROLE, tenantId, passwordHash, options);
}

export function signTrainerSession(
  tenantId: string,
  passwordHash: string,
  sessionId?: string,
  expiresAt?: number
): string | null {
  return issueTrainerSession(tenantId, passwordHash, { sessionId, expiresAt })?.token ?? null;
}

export function parseTrainerSession(
  value: string | undefined,
  tenantId: string,
  passwordHash: string
): StaffSessionTokenDetails | null {
  return parseScopedSession(TRAINER_ROLE, value, tenantId, passwordHash);
}

export function verifyTrainerSession(
  value: string | undefined,
  tenantId: string,
  passwordHash: string
): boolean {
  return parseTrainerSession(value, tenantId, passwordHash) !== null;
}

// Staff sessions are per-account and bound to the account's current password
// hash. The account id is embedded so the server can load the row, re-check
// active/role/permissions, and verify the signature with the current hash.
export function issueStaffSession(
  tenantId: string,
  staffId: string,
  passwordHash: string,
  options?: { sessionId?: string; expiresAt?: number }
): IssuedStaffSessionToken | null {
  const key = scopedSessionKey(passwordHash);
  if (!key) return null;

  const sessionId = options?.sessionId ?? randomUUID();
  const expiresAt = options?.expiresAt ?? Date.now() + STAFF_DEFAULT_TTL_MS;
  const encoded = Buffer.from(
    `${STAFF_ROLE}:${tenantId}:${staffId}:${sessionId}:${expiresAt}`,
    "utf8"
  ).toString("base64url");
  return {
    token: `${encoded}.${sign(encoded, key)}`,
    sessionId,
    expiresAt,
  };
}

export function signStaffSession(
  tenantId: string,
  staffId: string,
  passwordHash: string,
  sessionId?: string,
  expiresAt?: number
): string | null {
  return issueStaffSession(tenantId, staffId, passwordHash, { sessionId, expiresAt })?.token ?? null;
}

export function parseStaffSession(
  value: string | undefined
): { tenantId: string; staffId: string } | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  try {
    const payload = Buffer.from(value.slice(0, separator), "base64url").toString("utf8");
    const parts = payload.split(":");
    if (parts.length !== 5 || parts[0] !== STAFF_ROLE) return null;
    const [, tenantId, staffId, sessionId, rawExpires] = parts;
    const expiresAt = Number(rawExpires);
    if (!tenantId || !staffId || !sessionId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null;
    }
    return { tenantId, staffId };
  } catch {
    return null;
  }
}

export function verifyStaffSessionDetails(
  value: string | undefined,
  tenantId: string,
  staffId: string,
  passwordHash: string
): NamedStaffSessionDetails | null {
  const key = scopedSessionKey(passwordHash);
  if (!key) return null;

  const payload = verifySignedPayload(value, key);
  if (!payload) return null;

  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== STAFF_ROLE) return null;
  const [, tokenTenant, tokenStaffId, sessionId, rawExpires] = parts;
  const expiresAt = Number(rawExpires);
  if (
    tokenTenant !== tenantId ||
    tokenStaffId !== staffId ||
    !sessionId ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return null;
  }
  return { tenantId, staffId, sessionId, expiresAt };
}

export function verifyStaffSession(
  value: string | undefined,
  tenantId: string,
  staffId: string,
  passwordHash: string
): boolean {
  return verifyStaffSessionDetails(value, tenantId, staffId, passwordHash) !== null;
}
