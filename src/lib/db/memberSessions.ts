import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { DbMemberSession, MemberSessionInput } from "./types";

// Server-side member sessions.
//
// The signed cookie carries a random session id. Only its SHA-256 hash is stored
// here: a database dump cannot be converted back into a usable cookie. Every
// member API checks this table, so deleting/revoking a row invalidates the
// session immediately even though the cookie itself is still in the browser.

export function createMemberSession(
  input: MemberSessionInput,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    db.prepare(
      `INSERT INTO member_sessions
         (session_id_hash, member_id, created_at, last_seen_at, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.sessionIdHash,
      input.memberId,
      input.createdAt,
      input.lastSeenAt,
      input.expiresAt,
      input.ip ?? null,
      input.userAgent ?? null
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] createMemberSession failed:", err);
    return false;
  }
}

export function getMemberSession(
  sessionIdHash: string,
  tenantId: string = DEFAULT_TENANT_ID
): DbMemberSession | null {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare("SELECT * FROM member_sessions WHERE session_id_hash = ?")
      .get(sessionIdHash) as DbMemberSession | undefined;
    return row ?? null;
  } catch (err) {
    console.error("[sqliteDb] getMemberSession failed:", err);
    return null;
  }
}

export function touchMemberSession(
  sessionIdHash: string,
  lastSeenAt: number,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_sessions
         SET last_seen_at = ?
         WHERE session_id_hash = ? AND revoked_at IS NULL AND expires_at > ?`
      )
      .run(lastSeenAt, sessionIdHash, lastSeenAt);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] touchMemberSession failed:", err);
    return false;
  }
}

export function revokeMemberSession(
  sessionIdHash: string,
  memberId: string,
  revokedAt: number,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_sessions
         SET revoked_at = COALESCE(revoked_at, ?)
         WHERE session_id_hash = ? AND member_id = ?`
      )
      .run(revokedAt, sessionIdHash, memberId);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] revokeMemberSession failed:", err);
    return false;
  }
}

export function revokeAllMemberSessions(
  memberId: string,
  revokedAt: number,
  tenantId: string = DEFAULT_TENANT_ID,
  exceptSessionIdHash?: string
): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_sessions
         SET revoked_at = ?
         WHERE member_id = ? AND revoked_at IS NULL
           AND (? IS NULL OR session_id_hash <> ?)`
      )
      .run(revokedAt, memberId, exceptSessionIdHash ?? null, exceptSessionIdHash ?? null);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] revokeAllMemberSessions failed:", err);
    return 0;
  }
}

export function enforceMemberSessionLimit(
  memberId: string,
  limit: number,
  now: number,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const cap = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = db
      .prepare(
        `SELECT session_id_hash FROM member_sessions
         WHERE member_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC, rowid DESC`
      )
      .all(memberId, now) as Array<{ session_id_hash: string }>;

    if (rows.length <= cap) return 0;

    const revoke = db.prepare(
      "UPDATE member_sessions SET revoked_at = ? WHERE session_id_hash = ? AND revoked_at IS NULL"
    );
    const excess = rows.slice(cap);
    for (const row of excess) {
      revoke.run(now, row.session_id_hash);
    }
    return excess.length;
  } catch (err) {
    console.error("[sqliteDb] enforceMemberSessionLimit failed:", err);
    return 0;
  }
}

export function listMemberSessionHistory(
  memberId: string,
  limit: number = 1000,
  tenantId: string = DEFAULT_TENANT_ID
): DbMemberSession[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        `SELECT * FROM member_sessions
         WHERE member_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(memberId, Math.max(1, Math.min(1000, limit))) as unknown as DbMemberSession[];
  } catch (err) {
    console.error("[sqliteDb] listMemberSessionHistory failed:", err);
    return [];
  }
}

export function listMemberSessions(
  memberId: string,
  activeSince: number,
  now: number,
  tenantId: string = DEFAULT_TENANT_ID
): DbMemberSession[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        `SELECT * FROM member_sessions
         WHERE member_id = ? AND revoked_at IS NULL
           AND expires_at > ? AND last_seen_at > ?
         ORDER BY last_seen_at DESC`
      )
      .all(memberId, now, activeSince) as unknown as DbMemberSession[];
  } catch (err) {
    console.error("[sqliteDb] listMemberSessions failed:", err);
    return [];
  }
}

export function purgeMemberSessions(now: number, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    const db = getDatabase(tenantId);
    const revokedCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const result = db
      .prepare(
        `DELETE FROM member_sessions
         WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)`
      )
      .run(now, revokedCutoff);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] purgeMemberSessions failed:", err);
    return 0;
  }
}
