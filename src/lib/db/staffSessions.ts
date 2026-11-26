import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { DbStaffSession, StaffSessionInput } from "./types";

/**
 * Persist a server-side staff/admin/trainer session record so cookies can be
 * checked for revocation and idle/absolute expiry on every request.
 */
export function createStaffSession(
  input: StaffSessionInput,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  if (!input.id || !input.actorKey || !input.role || !Number.isFinite(input.expiresAt)) {
    return false;
  }

  const createdAt = Number.isFinite(input.createdAt) ? Number(input.createdAt) : Date.now();
  try {
    const db = getDatabase(tenantId);
    db.prepare(
      `INSERT INTO staff_sessions (id, actor_key, role, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         actor_key = excluded.actor_key,
         role = excluded.role,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at,
         revoked_at = NULL`
    ).run(input.id, input.actorKey, input.role, createdAt, input.expiresAt);
    return true;
  } catch {
    return false;
  }
}

/**
 * Look up a staff session row by its stored (hashed) session ID.
 */
export function getStaffSessionRow(
  id: string,
  tenantId: string = DEFAULT_TENANT_ID
): DbStaffSession | null {
  if (!id) return null;
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare(
        `SELECT id, actor_key, role, created_at, expires_at, revoked_at
         FROM staff_sessions
         WHERE id = ?`
      )
      .get(id) as DbStaffSession | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Revoke a single staff/admin/trainer session by its stored (hashed) session ID.
 */
export function revokeStaffSession(
  id: string,
  revokedAt: number = Date.now(),
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  if (!id) return false;
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE staff_sessions
         SET revoked_at = ?
         WHERE id = ? AND revoked_at IS NULL`
      )
      .run(revokedAt, id);
    return Number(result.changes) > 0;
  } catch {
    return false;
  }
}

/**
 * Revoke all active sessions belonging to an actor (e.g. `staff:<id>` or `legacy:admin`).
 */
export function revokeAllStaffSessions(
  actorKey: string,
  revokedAt: number = Date.now(),
  tenantId: string = DEFAULT_TENANT_ID
): number {
  if (!actorKey) return 0;
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE staff_sessions
         SET revoked_at = ?
         WHERE actor_key = ? AND revoked_at IS NULL`
      )
      .run(revokedAt, actorKey);
    return Number(result.changes);
  } catch {
    return 0;
  }
}

/**
 * Delete expired or revoked staff sessions from the tenant database.
 */
export function purgeStaffSessions(
  now: number = Date.now(),
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `DELETE FROM staff_sessions
         WHERE expires_at <= ? OR revoked_at IS NOT NULL`
      )
      .run(now);
    return Number(result.changes);
  } catch {
    return 0;
  }
}
