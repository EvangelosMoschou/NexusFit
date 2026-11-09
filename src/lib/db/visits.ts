import { randomUUID } from "node:crypto";
import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { DbVisit, InsideMember, VisitWithMember } from "./types";
import { getSavedGymConfig } from "./gymConfig";

// Visits, check-in/check-out, occupancy and the idle/stale auto-checkout rules.

const STALE_VISIT_HOURS = 8;

function staleVisitCutoff(hours: number = STALE_VISIT_HOURS): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function idleVisitCutoff(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
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
  try {
    const db = getDatabase(tenantId);
    const member = db.prepare("SELECT id FROM members WHERE id = ?").get(memberId);
    if (!member) return { status: "unknown" };

    const now = new Date().toISOString();
    // A forgotten check-out should not keep someone "inside" forever.
    db.prepare(
      `UPDATE visits SET checked_out_at = ?
       WHERE member_id = ? AND checked_out_at IS NULL AND checked_in_at < ?`
    ).run(now, memberId, staleVisitCutoff());

    const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
    if (idleMinutes > 0) {
      db.prepare(
        `UPDATE visits SET checked_out_at = ?
         WHERE member_id = ? AND checked_out_at IS NULL
           AND COALESCE(last_activity_at, checked_in_at) < ?`
      ).run(now, memberId, idleVisitCutoff(idleMinutes));
    }

    const open = db
      .prepare(
        `SELECT * FROM visits
         WHERE member_id = ? AND checked_out_at IS NULL
         ORDER BY checked_in_at DESC LIMIT 1`
      )
      .get(memberId) as DbVisit | undefined;

    if (open) return { status: "already_in", visit: open };

    const visit: DbVisit = {
      id: `visit-${randomUUID()}`,
      member_id: memberId,
      checked_in_at: now,
      checked_out_at: null,
      last_activity_at: now,
      created_at: now,
    };
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

    return { status: "in", visit };
  } catch (err) {
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
    const result = db
      .prepare(
        `UPDATE visits SET checked_out_at = ?
         WHERE checked_out_at IS NULL
           AND COALESCE(last_activity_at, checked_in_at) < ?`
      )
      .run(new Date().toISOString(), idleVisitCutoff(minutes));
    return Number(result.changes);
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
    const result = db
      .prepare(
        "UPDATE visits SET checked_out_at = ? WHERE checked_out_at IS NULL AND checked_in_at < ?"
      )
      .run(new Date().toISOString(), staleVisitCutoff(hours));
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] closeStaleVisits failed:", err);
    return 0;
  }
}
