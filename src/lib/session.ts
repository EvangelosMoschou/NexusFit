import { createHmac, timingSafeEqual } from "node:crypto";
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

// Binding the signature to the current trainer password hash means rotating the
// password invalidates every outstanding trainer cookie immediately.
function trainerSessionKey(passwordHash: string): string | null {
  const secret = memberSessionSecret();
  if (!secret || !passwordHash) return null;
  return `${secret}:${passwordHash}`;
}

export function signTrainerSession(tenantId: string, passwordHash: string): string | null {
  const key = trainerSessionKey(passwordHash);
  if (!key) return null;

  const encoded = Buffer.from(`${TRAINER_ROLE}:${tenantId}`, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, key)}`;
}

export function verifyTrainerSession(
  value: string | undefined,
  tenantId: string,
  passwordHash: string
): boolean {
  const key = trainerSessionKey(passwordHash);
  if (!key || !value) return false;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;

  const encoded = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), "hex");
  const expected = Buffer.from(sign(encoded, key), "hex");

  if (provided.length !== expected.length) return false;
  if (!timingSafeEqual(provided, expected)) return false;

  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  return payload === `${TRAINER_ROLE}:${tenantId}`;
}

// Staff sessions are per-account and bound to the account's current password
// hash. The account id is embedded so the server can load the row, re-check
// active/role/permissions, and verify the signature with the current hash.
const STAFF_ROLE = "@staff";

function staffSessionKey(passwordHash: string): string | null {
  const secret = memberSessionSecret();
  if (!secret || !passwordHash) return null;
  return `${secret}:${passwordHash}`;
}

export function signStaffSession(
  tenantId: string,
  staffId: string,
  passwordHash: string
): string | null {
  const key = staffSessionKey(passwordHash);
  if (!key) return null;

  const encoded = Buffer.from(`${STAFF_ROLE}:${tenantId}:${staffId}`, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, key)}`;
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
    if (parts.length !== 3 || parts[0] !== STAFF_ROLE) return null;
    const [, tenantId, staffId] = parts;
    if (!tenantId || !staffId) return null;
    return { tenantId, staffId };
  } catch {
    return null;
  }
}

export function verifyStaffSession(
  value: string | undefined,
  tenantId: string,
  staffId: string,
  passwordHash: string
): boolean {
  const key = staffSessionKey(passwordHash);
  if (!key || !value) return false;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;

  const encoded = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), "hex");
  const expected = Buffer.from(sign(encoded, key), "hex");

  if (provided.length !== expected.length) return false;
  if (!timingSafeEqual(provided, expected)) return false;

  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  return payload === `${STAFF_ROLE}:${tenantId}:${staffId}`;
}
