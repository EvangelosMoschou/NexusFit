import { randomUUID } from "node:crypto";
import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { AccessAlert, AccessEvent, AccessEventWithMember } from "./types";

// Access-control anomalies (duplicate entry, quick re-entry) and the weekly
// alert query.

function rowToAccessEvent(row: Record<string, unknown>): AccessEvent {
  let details: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.details ?? "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      details = parsed as Record<string, unknown>;
    }
  } catch {
    details = {};
  }

  return {
    id: String(row.id),
    member_id: String(row.member_id),
    event_type: String(row.event_type),
    details,
    created_at: String(row.created_at),
  };
}

export function recordAccessEvent(
  memberId: string,
  eventType: string,
  details: Record<string, unknown> = {},
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    db.prepare(
      `INSERT INTO access_events (id, member_id, event_type, details, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      `access-event-${randomUUID()}`,
      memberId,
      eventType,
      JSON.stringify(details),
      new Date().toISOString()
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] recordAccessEvent failed:", err);
    return false;
  }
}

export function countAccessEvents(
  memberId: string,
  days: number = 7,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const row = db
      .prepare("SELECT COUNT(*) as c FROM access_events WHERE member_id = ? AND created_at >= ?")
      .get(memberId, since) as { c: number };
    return row.c;
  } catch (err) {
    console.error("[sqliteDb] countAccessEvents failed:", err);
    return 0;
  }
}

export function listAccessAlerts(
  threshold: number = 1,
  days: number = 7,
  tenantId: string = DEFAULT_TENANT_ID
): AccessAlert[] {
  try {
    const db = getDatabase(tenantId);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = db
      .prepare(
        `SELECT e.member_id, m.member_code, m.full_name,
                COUNT(*) as event_count,
                MAX(e.created_at) as last_event_at,
                GROUP_CONCAT(DISTINCT e.event_type) as event_types
         FROM access_events e
         JOIN members m ON m.id = e.member_id
         WHERE e.created_at >= ?
         GROUP BY e.member_id
         HAVING COUNT(*) > ?
         ORDER BY event_count DESC, last_event_at DESC`
      )
      .all(since, threshold) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      member_id: String(row.member_id),
      member_code: String(row.member_code),
      full_name: String(row.full_name),
      event_count: Number(row.event_count),
      last_event_at: String(row.last_event_at),
      event_types: String(row.event_types ?? "")
        .split(",")
        .filter(Boolean),
    }));
  } catch (err) {
    console.error("[sqliteDb] listAccessAlerts failed:", err);
    return [];
  }
}

export function listMemberAccessEvents(
  memberId: string,
  limit: number = 1000,
  tenantId: string = DEFAULT_TENANT_ID
): AccessEvent[] {
  try {
    const db = getDatabase(tenantId);
    const safeLimit = Math.min(1000, Math.max(1, limit));
    return (
      db
        .prepare(
          `SELECT * FROM access_events
           WHERE member_id = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(memberId, safeLimit) as Record<string, unknown>[]
    ).map(rowToAccessEvent);
  } catch (err) {
    console.error("[sqliteDb] listMemberAccessEvents failed:", err);
    return [];
  }
}

export function listRecentAccessEvents(
  limit: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): AccessEventWithMember[] {
  try {
    const db = getDatabase(tenantId);
    const safeLimit = Math.min(200, Math.max(1, limit));
    const rows = db
      .prepare(
        `SELECT e.*, m.member_code, m.full_name
         FROM access_events e
         JOIN members m ON m.id = e.member_id
         ORDER BY e.created_at DESC LIMIT ?`
      )
      .all(safeLimit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      ...rowToAccessEvent(row),
      member_code: String(row.member_code),
      full_name: String(row.full_name),
    }));
  } catch (err) {
    console.error("[sqliteDb] listRecentAccessEvents failed:", err);
    return [];
  }
}

export function purgeAccessEvents(
  days: number = 365,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    if (!Number.isFinite(days) || days <= 0) return 0;
    const db = getDatabase(tenantId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare("DELETE FROM access_events WHERE created_at < ?").run(cutoff);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] purgeAccessEvents failed:", err);
    return 0;
  }
}
