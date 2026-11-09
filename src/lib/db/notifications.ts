import { randomUUID } from "node:crypto";
import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { MemberNotification, MemberNotificationInput } from "./types";

// In-app member notification feed. The unique (member_id, dedupe_key) index
// makes generation idempotent.

function rowToMemberNotification(row: Record<string, unknown>): MemberNotification {
  return {
    id: String(row.id),
    member_id: String(row.member_id),
    type: String(row.type),
    title: String(row.title),
    body: String(row.body),
    dedupe_key: String(row.dedupe_key),
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at),
  };
}

export function ensureMemberNotification(
  memberId: string,
  input: MemberNotificationInput,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO member_notifications
           (id, member_id, type, title, body, dedupe_key, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `notification-${randomUUID()}`,
        memberId,
        input.type,
        input.title,
        input.body,
        input.dedupeKey,
        null,
        new Date().toISOString()
      );
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] ensureMemberNotification failed:", err);
    return false;
  }
}

export function listMemberNotifications(
  memberId: string,
  limit: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): MemberNotification[] {
  try {
    const db = getDatabase(tenantId);
    const safeLimit = Math.min(100, Math.max(1, Number.isFinite(limit) ? limit : 50));
    return (
      db
        .prepare(
          `SELECT * FROM member_notifications
           WHERE member_id = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(memberId, safeLimit) as Record<string, unknown>[]
    ).map(rowToMemberNotification);
  } catch (err) {
    console.error("[sqliteDb] listMemberNotifications failed:", err);
    return [];
  }
}

export function getUnreadNotificationCount(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare(
        `SELECT COUNT(*) as c FROM member_notifications
         WHERE member_id = ? AND read_at IS NULL`
      )
      .get(memberId) as { c: number };
    return row.c;
  } catch (err) {
    console.error("[sqliteDb] getUnreadNotificationCount failed:", err);
    return 0;
  }
}

export function markMemberNotificationRead(
  memberId: string,
  notificationId: string,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_notifications SET read_at = ?
         WHERE id = ? AND member_id = ? AND read_at IS NULL`
      )
      .run(new Date().toISOString(), notificationId, memberId);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] markMemberNotificationRead failed:", err);
    return false;
  }
}

export function markAllMemberNotificationsRead(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_notifications SET read_at = ?
         WHERE member_id = ? AND read_at IS NULL`
      )
      .run(new Date().toISOString(), memberId);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] markAllMemberNotificationsRead failed:", err);
    return 0;
  }
}
