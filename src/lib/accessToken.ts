import { createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 90;

interface AccessPayload {
  v: 1;
  t: string;
  m: string;
  iat: number;
}

function accessSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  return secret;
}

function signature(payload: string, tenantId: string): string | null {
  const secret = accessSecret();
  if (!secret) return null;
  return createHmac("sha256", `${secret}:access:${tenantId}`)
    .update(payload)
    .digest("base64url");
}

export function signAccessToken(
  tenantId: string,
  memberId: string
): { token: string; expiresAt: string } | null {
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ v: 1, t: tenantId, m: memberId, iat } satisfies AccessPayload),
    "utf8"
  ).toString("base64url");
  const sig = signature(payload, tenantId);
  if (!sig) return null;

  return {
    token: `${payload}.${sig}`,
    expiresAt: new Date((iat + ACCESS_TOKEN_TTL_SECONDS) * 1000).toISOString(),
  };
}

export function verifyAccessToken(
  token: string | undefined,
  tenantId: string
): { memberId: string; issuedAt: number } | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = signature(payload, tenantId);
  if (!expected) return null;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<AccessPayload>;

    if (parsed.v !== 1 || parsed.t !== tenantId || typeof parsed.m !== "string") {
      return null;
    }
    if (typeof parsed.iat !== "number" || !Number.isFinite(parsed.iat)) return null;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parsed.iat) > ACCESS_TOKEN_TTL_SECONDS) return null;

    return { memberId: parsed.m, issuedAt: parsed.iat };
  } catch {
    return null;
  }
}

export function reentryCooldownMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Νέα είσοδος επιτρέπεται σε ${minutes} ${
    minutes === 1 ? "λεπτό" : "λεπτά"
  }.`;
}

export function accessControlConfigured(): boolean {
  const key = process.env.ACCESS_CONTROL_KEY;
  return Boolean(key && key.length >= 16);
}

export function verifyAccessDeviceKey(provided: string | undefined): boolean {
  const expected = process.env.ACCESS_CONTROL_KEY;
  if (!expected || expected.length < 16 || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
