import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { DbVisit, InsideMember, VisitWithMember } from "./types";
import { getSavedGymConfig } from "./gymConfig";

// Visits, check-in/check-out, occupancy and the idle/stale auto-checkout rules.

const STALE_VISIT_HOURS = 8;

function staleVisitCutoff(hours: number = STALE_VISIT_HOURS, nowMs: number = Date.now()): string {
  return new Date(nowMs - hours * 60 * 60 * 1000).toISOString();
}

function idleVisitCutoff(minutes: number, nowMs: number = Date.now()): string {
  return new Date(nowMs - minutes * 60 * 1000).toISOString();
}

function boundedCheckoutIso(baseIso: string, windowMs: number, nowMs: number): string {
  const baseMs = Date.parse(baseIso);
  if (!Number.isFinite(baseMs)) return new Date(nowMs).toISOString();
  return new Date(Math.min(nowMs, baseMs + windowMs)).toISOString();
}

function closeVisitsWithWindow(
  db: DatabaseSync,
  whereSql: string,
  params: Array<string | number>,
  baseField: "checked_in_at" | "last_activity_at",
  windowMs: number,
  nowMs: number
): number {
  const rows = db
    .prepare(
      `SELECT id, checked_in_at, last_activity_at
       FROM visits
       WHERE ${whereSql}`
    )
    .all(...params) as Array<{
    id: string;
    checked_in_at: string;
    last_activity_at: string | null;
  }>;

  if (rows.length === 0) return 0;

  const update = db.prepare(
    "UPDATE visits SET checked_out_at = ? WHERE id = ? AND checked_out_at IS NULL"
  );
  let closed = 0;
  for (const row of rows) {
    const baseIso =
      baseField === "last_activity_at" ? (row.last_activity_at ?? row.checked_in_at) : row.checked_in_at;
    const result = update.run(boundedCheckoutIso(baseIso, windowMs, nowMs), row.id);
    closed += Number(result.changes);
  }
  return closed;
}

function isUniqueConstraintError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(message);
}

export function getLastCheckoutAt(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): string | null {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare(
        `SELECT checked_out_at FROM visits
         WHERE member_id = ? AND checked_out_at IS NOT NULL
         ORDER BY checked_out_at DESC LIMIT 1`
      )
      .get(memberId) as { checked_out_at: string } | undefined;
    return row?.checked_out_at ?? null;
  } catch (err) {
    console.error("[sqliteDb] getLastCheckoutAt failed:", err);
    return null;
  }
}

export function getReentryCooldownSeconds(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const minutes = getSavedGymConfig(tenantId).reentryCooldownMinutes || 0;
    if (minutes <= 0) return 0;

    const last = db
      .prepare(
        `SELECT checked_out_at FROM visits
         WHERE member_id = ? AND checked_out_at IS NOT NULL
         ORDER BY checked_out_at DESC LIMIT 1`
      )
      .get(memberId) as { checked_out_at: string } | undefined;

    if (!last) return 0;
    const elapsedMs = Date.now() - Date.parse(last.checked_out_at);
    if (!Number.isFinite(elapsedMs)) return 0;
    const remainingMs = minutes * 60_000 - elapsedMs;
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  } catch (err) {
    console.error("[sqliteDb] getReentryCooldownSeconds failed:", err);
    return 0;
  }
}

export function getMemberVisitStatus(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): { inside: boolean; since: string | null } {
  try {
    const db = getDatabase(tenantId);
    const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
    const activityCutoff = idleMinutes > 0 ? idleVisitCutoff(idleMinutes) : null;
    const row = db
      .prepare(
        `SELECT checked_in_at FROM visits
         WHERE member_id = ? AND checked_out_at IS NULL AND checked_in_at >= ?
           AND (? IS NULL OR COALESCE(last_activity_at, checked_in_at) >= ?)
         ORDER BY checked_in_at DESC LIMIT 1`
      )
      .get(memberId, staleVisitCutoff(), activityCutoff, activityCutoff) as
      { checked_in_at: string } | undefined;

    return { inside: Boolean(row), since: row?.checked_in_at ?? null };
  } catch (err) {
    console.error("[sqliteDb] getMemberVisitStatus failed:", err);
    return { inside: false, since: null };
  }
}

export function checkInMember(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): { status: "in" | "already_in" | "unknown"; visit?: DbVisit } {
  const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
  let db: DatabaseSync | null = null;
  let inTx = false;

  try {
    db = getDatabase(tenantId);
    db.exec("BEGIN IMMEDIATE");
    inTx = true;

    const member = db.prepare("SELECT id FROM members WHERE id = ?").get(memberId);
    if (!member) {
      db.exec("COMMIT");
      inTx = false;
      return { status: "unknown" };
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    // Close forgotten visits at their accurate expiry boundary (check-in + window)
    // rather than clamping to `now`.
    closeVisitsWithWindow(
      db,
      "member_id = ? AND checked_out_at IS NULL AND checked_in_at < ?",
      [memberId, staleVisitCutoff(STALE_VISIT_HOURS, nowMs)],
      "checked_in_at",
      STALE_VISIT_HOURS * 60 * 60 * 1000,
      nowMs
    );

    if (idleMinutes > 0) {
      closeVisitsWithWindow(
        db,
        `member_id = ? AND checked_out_at IS NULL
         AND COALESCE(last_activity_at, checked_in_at) < ?`,
        [memberId, idleVisitCutoff(idleMinutes, nowMs)],
        "last_activity_at",
        idleMinutes * 60 * 1000,
        nowMs
      );
    }

    const openQuery = db.prepare(
      `SELECT * FROM visits
       WHERE member_id = ? AND checked_out_at IS NULL
       ORDER BY checked_in_at DESC LIMIT 1`
    );
    const open = openQuery.get(memberId) as DbVisit | undefined;
    if (open) {
      db.exec("COMMIT");
      inTx = false;
      return { status: "already_in", visit: open };
    }

    const visit: DbVisit = {
      id: `visit-${randomUUID()}`,
      member_id: memberId,
      checked_in_at: now,
      checked_out_at: null,
      last_activity_at: now,
      created_at: now,
    };

    try {
      db.prepare(
        "INSERT INTO visits (id, member_id, checked_in_at, checked_out_at, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(
        visit.id,
        visit.member_id,
        visit.checked_in_at,
        visit.checked_out_at,
        visit.last_activity_at,
        visit.created_at
      );
    } catch (insertErr) {
      if (isUniqueConstraintError(insertErr)) {
        db.exec("ROLLBACK");
        inTx = false;
        const concurrentOpen = openQuery.get(memberId) as DbVisit | undefined;
        if (concurrentOpen) return { status: "already_in", visit: concurrentOpen };
      }
      throw insertErr;
    }

    db.exec("COMMIT");
    inTx = false;
    return { status: "in", visit };
  } catch (err) {
    if (db && inTx) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Ignore rollback failure when connection already closed/aborted.
      }
    }
    console.error("[sqliteDb] checkInMember failed:", err);
    return { status: "unknown" };
  }
}

export function checkOutMember(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): { status: "out" | "not_in"; visit?: DbVisit } {
  try {
    const db = getDatabase(tenantId);
    const open = db
      .prepare(
        `SELECT * FROM visits
         WHERE member_id = ? AND checked_out_at IS NULL
         ORDER BY checked_in_at DESC LIMIT 1`
      )
      .get(memberId) as DbVisit | undefined;

    if (!open) return { status: "not_in" };

    const now = new Date().toISOString();
    db.prepare("UPDATE visits SET checked_out_at = ? WHERE id = ?").run(now, open.id);
    return { status: "out", visit: { ...open, checked_out_at: now } };
  } catch (err) {
    console.error("[sqliteDb] checkOutMember failed:", err);
    return { status: "not_in" };
  }
}

export function getOccupancy(tenantId: string = DEFAULT_TENANT_ID): {
  inside: number;
  capacity: number;
} {
  try {
    const db = getDatabase(tenantId);
    const config = getSavedGymConfig(tenantId);
    const idleMinutes = config.idleCheckoutMinutes || 0;
    const activityCutoff = idleMinutes > 0 ? idleVisitCutoff(idleMinutes) : null;
    const row = db
      .prepare(
        `SELECT COUNT(*) as c FROM visits
         WHERE checked_out_at IS NULL AND checked_in_at >= ?
           AND (? IS NULL OR COALESCE(last_activity_at, checked_in_at) >= ?)`
      )
      .get(staleVisitCutoff(), activityCutoff, activityCutoff) as { c: number };

    return {
      inside: row.c,
      capacity: config.capacity || 0,
    };
  } catch (err) {
    console.error("[sqliteDb] getOccupancy failed:", err);
    return { inside: 0, capacity: 0 };
  }
}

export function getInsideMembers(tenantId: string = DEFAULT_TENANT_ID): InsideMember[] {
  try {
    const db = getDatabase(tenantId);
    const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
    const activityCutoff = idleMinutes > 0 ? idleVisitCutoff(idleMinutes) : null;
    return db
      .prepare(
        `SELECT v.member_id, m.member_code, m.full_name, v.checked_in_at
         FROM visits v JOIN members m ON m.id = v.member_id
         WHERE v.checked_out_at IS NULL AND v.checked_in_at >= ?
           AND (? IS NULL OR COALESCE(v.last_activity_at, v.checked_in_at) >= ?)
         ORDER BY v.checked_in_at ASC`
      )
      .all(staleVisitCutoff(), activityCutoff, activityCutoff) as unknown as InsideMember[];
  } catch (err) {
    console.error("[sqliteDb] getInsideMembers failed:", err);
    return [];
  }
}

// Any member action (portal heartbeat, weight log, plan save) keeps the open
// visit alive so idle auto-checkout does not close an active workout.
export function touchMemberVisit(memberId: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
    const activityCutoff = idleMinutes > 0 ? idleVisitCutoff(idleMinutes) : null;

    // Do not revive a visit that has already crossed the idle threshold.
    const result = db
      .prepare(
        `UPDATE visits SET last_activity_at = ?
         WHERE id = (
           SELECT id FROM visits
           WHERE member_id = ? AND checked_out_at IS NULL
             AND checked_in_at >= ?
             AND (? IS NULL OR COALESCE(last_activity_at, checked_in_at) >= ?)
           ORDER BY checked_in_at DESC LIMIT 1
         )`
      )
      .run(new Date().toISOString(), memberId, staleVisitCutoff(), activityCutoff, activityCutoff);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] touchMemberVisit failed:", err);
    return false;
  }
}

export function closeIdleVisits(minutes: number, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    const db = getDatabase(tenantId);
    const nowMs = Date.now();
    return closeVisitsWithWindow(
      db,
      `checked_out_at IS NULL AND COALESCE(last_activity_at, checked_in_at) < ?`,
      [idleVisitCutoff(minutes, nowMs)],
      "last_activity_at",
      minutes * 60 * 1000,
      nowMs
    );
  } catch (err) {
    console.error("[sqliteDb] closeIdleVisits failed:", err);
    return 0;
  }
}

export function getMemberVisitCount(
  memberId: string,
  days: number = 30,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const row = db
      .prepare("SELECT COUNT(*) as c FROM visits WHERE member_id = ? AND checked_in_at >= ?")
      .get(memberId, cutoff) as { c: number };
    return row.c;
  } catch (err) {
    console.error("[sqliteDb] getMemberVisitCount failed:", err);
    return 0;
  }
}

export function getMemberVisits(
  memberId: string,
  limit: number = 20,
  tenantId: string = DEFAULT_TENANT_ID
): DbVisit[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare("SELECT * FROM visits WHERE member_id = ? ORDER BY checked_in_at DESC LIMIT ?")
      .all(memberId, limit) as unknown as DbVisit[];
  } catch (err) {
    console.error("[sqliteDb] getMemberVisits failed:", err);
    return [];
  }
}

export function getVisitIntervalsSince(
  since: string,
  tenantId: string = DEFAULT_TENANT_ID
): Array<{ checked_in_at: string; checked_out_at: string | null }> {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        `SELECT checked_in_at, checked_out_at FROM visits
         WHERE checked_in_at >= ?
         ORDER BY checked_in_at ASC`
      )
      .all(since) as Array<{
      checked_in_at: string;
      checked_out_at: string | null;
    }>;
  } catch (err) {
    console.error("[sqliteDb] getVisitIntervalsSince failed:", err);
    return [];
  }
}

export function getRecentVisits(
  limit: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): VisitWithMember[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        `SELECT v.*, m.member_code, m.full_name
         FROM visits v JOIN members m ON m.id = v.member_id
         ORDER BY v.checked_in_at DESC LIMIT ?`
      )
      .all(limit) as unknown as VisitWithMember[];
  } catch (err) {
    console.error("[sqliteDb] getRecentVisits failed:", err);
    return [];
  }
}

export function closeStaleVisits(
  hours: number = STALE_VISIT_HOURS,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const nowMs = Date.now();
    return closeVisitsWithWindow(
      db,
      "checked_out_at IS NULL AND checked_in_at < ?",
      [staleVisitCutoff(hours, nowMs)],
      "checked_in_at",
      hours * 60 * 60 * 1000,
      nowMs
    );
  } catch (err) {
    console.error("[sqliteDb] closeStaleVisits failed:", err);
    return 0;
  }
}
