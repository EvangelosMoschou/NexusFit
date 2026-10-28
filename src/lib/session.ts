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

export function signMemberId(memberId: string): string | null {
  const secret = memberSessionSecret();
  if (!secret) return null;
  return `${memberId}.${sign(memberId, secret)}`;
}

export function verifyMemberSession(value: string | undefined): string | null {
  const secret = memberSessionSecret();
  if (!secret || !value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const memberId = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), "hex");
  const expected = Buffer.from(sign(memberId, secret), "hex");

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return memberId;
}
