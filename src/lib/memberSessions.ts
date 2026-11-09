import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getRepository } from "@/lib/db";
import type { DbMemberSession } from "@/lib/db/types";
import { MEMBER_COOKIE } from "@/lib/cookies";
import { parseMemberSession, signMemberSession } from "@/lib/session";
import { getClientIp } from "@/lib/rateLimit";

// Member sessions live on the server so a stolen cookie can be revoked before
// its absolute expiry. The signed cookie carries a random session id; the
// database stores only its SHA-256 hash.
//
// Defaults:
//   * idle timeout: 7 days without an authenticated request
//   * absolute timeout: 30 days from login (matches the cookie Max-Age)
//   * last_seen_at is written at most once per minute to avoid a write on every
//     polling request.
function durationFromEnv(name: string, fallbackMs: number): number {
  const seconds = Number(process.env[name]);
  if (!Number.isFinite(seconds) || seconds < 60) return fallbackMs;
  return Math.floor(seconds * 1000);
}

export const MEMBER_SESSION_IDLE_MS = durationFromEnv(
  "MEMBER_SESSION_IDLE_SECONDS",
  7 * 24 * 60 * 60 * 1000
);
export const MEMBER_SESSION_ABSOLUTE_MS = durationFromEnv(
  "MEMBER_SESSION_ABSOLUTE_SECONDS",
  30 * 24 * 60 * 60 * 1000
);
export const MEMBER_SESSION_TOUCH_MS = durationFromEnv("MEMBER_SESSION_TOUCH_SECONDS", 60 * 1000);
export const MEMBER_SESSION_COOKIE_MAX_AGE_SECONDS = Math.floor(MEMBER_SESSION_ABSOLUTE_MS / 1000);
export const MEMBER_SESSION_MAX_ACTIVE = (() => {
  const value = Number(process.env.MEMBER_SESSION_MAX_ACTIVE);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 10;
})();

export interface ActiveMemberSession {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

export function hashMemberSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("base64url");
}

// Security/accountability event for a member session. Best-effort: an audit
// failure must not break login, logout or revocation.
export async function writeMemberSessionAudit(
  req: NextRequest,
  tenantId: string,
  memberId: string,
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const repo = getRepository(tenantId);
    const member = await repo.getMemberAccess(memberId);
    const ip = getClientIp(req.headers);
    await repo.logAudit({
      actorId: memberId,
      actorName: member?.full_name ?? "Μέλος",
      actorEmail: null,
      actorRole: "member",
      actorLegacy: false,
      action,
      entityType: "member",
      entityId: memberId,
      details,
      ip: ip === "unknown" ? null : ip.slice(0, 64),
    });
  } catch (err) {
    console.error("[memberSessions] audit failed:", err);
  }
}

function requestMetadata(req: NextRequest): {
  ip: string | null;
  userAgent: string | null;
} {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get("user-agent")?.trim().slice(0, 255) || null;
  return {
    ip: ip === "unknown" ? null : ip.slice(0, 64),
    userAgent,
  };
}

export async function createMemberSession(
  tenantId: string,
  memberId: string,
  req: NextRequest
): Promise<string | null> {
  const sessionId = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + MEMBER_SESSION_ABSOLUTE_MS;
  const token = signMemberSession(tenantId, memberId, sessionId, expiresAt);
  if (!token) return null;

  const { ip, userAgent } = requestMetadata(req);
  const repo = getRepository(tenantId);
  const sessionIdHash = hashMemberSessionId(sessionId);
  const created = await repo.createMemberSession({
    sessionIdHash,
    memberId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    ip,
    userAgent,
  });

  if (!created) return null;

  const revokedOldest = await repo.enforceMemberSessionLimit(
    memberId,
    MEMBER_SESSION_MAX_ACTIVE,
    now
  );
  if (revokedOldest > 0) {
    await writeMemberSessionAudit(req, tenantId, memberId, "member.session.limit_revoked", {
      revokedOldest,
    });
  }

  await writeMemberSessionAudit(req, tenantId, memberId, "member.session.login", {
    session: sessionIdHash.slice(0, 12),
  });
  return token;
}

export interface AuthenticatedMemberSession {
  memberId: string;
  sessionIdHash: string;
}

export async function authenticateMemberSession(
  req: NextRequest,
  tenantId: string
): Promise<AuthenticatedMemberSession | null> {
  const token = parseMemberSession(req.cookies.get(MEMBER_COOKIE)?.value, tenantId);
  if (!token) return null;

  const sessionIdHash = hashMemberSessionId(token.sessionId);
  const repo = getRepository(tenantId);
  const session = await repo.getMemberSession(sessionIdHash);
  const now = Date.now();

  if (
    !session ||
    session.member_id !== token.memberId ||
    session.revoked_at !== null ||
    session.expires_at !== token.expiresAt ||
    session.expires_at <= now
  ) {
    return null;
  }

  if (now - session.last_seen_at >= MEMBER_SESSION_IDLE_MS) {
    await repo.revokeMemberSession(sessionIdHash, token.memberId, now);
    await writeMemberSessionAudit(req, tenantId, token.memberId, "member.session.idle_expired", {
      session: sessionIdHash.slice(0, 12),
    });
    return null;
  }

  if (now - session.last_seen_at >= MEMBER_SESSION_TOUCH_MS) {
    const touched = await repo.touchMemberSession(sessionIdHash, now);
    if (!touched) return null;
  }

  return { memberId: token.memberId, sessionIdHash };
}

export async function revokeCurrentMemberSession(
  req: NextRequest,
  tenantId: string
): Promise<string | null> {
  const token = parseMemberSession(req.cookies.get(MEMBER_COOKIE)?.value, tenantId);
  if (!token) return null;

  await getRepository(tenantId).revokeMemberSession(
    hashMemberSessionId(token.sessionId),
    token.memberId,
    Date.now()
  );
  return token.memberId;
}

export async function revokeAllMemberSessions(
  tenantId: string,
  memberId: string,
  exceptSessionIdHash?: string
): Promise<number> {
  return getRepository(tenantId).revokeAllMemberSessions(memberId, Date.now(), exceptSessionIdHash);
}

export async function listActiveMemberSessions(
  req: NextRequest,
  tenantId: string
): Promise<ActiveMemberSession[] | null> {
  const authenticated = await authenticateMemberSession(req, tenantId);
  if (!authenticated) return null;

  const now = Date.now();
  const sessions = await getRepository(tenantId).listMemberSessions(
    authenticated.memberId,
    now - MEMBER_SESSION_IDLE_MS,
    now
  );

  return sessions.map((session: DbMemberSession) => ({
    id: session.session_id_hash,
    createdAt: session.created_at,
    lastSeenAt: session.last_seen_at,
    expiresAt: session.expires_at,
    ip: session.ip,
    userAgent: session.user_agent,
    current: session.session_id_hash === authenticated.sessionIdHash,
  }));
}

export async function revokeMemberSessionById(
  tenantId: string,
  memberId: string,
  sessionIdHash: string
): Promise<boolean> {
  return getRepository(tenantId).revokeMemberSession(sessionIdHash, memberId, Date.now());
}
