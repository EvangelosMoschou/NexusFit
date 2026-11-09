import { randomUUID } from "node:crypto";
import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { AuditEntry, AuditFilters, AuditInput, AuditPage } from "./types";

// Append-only staff/admin action history.

function rowToAuditEntry(row: Record<string, unknown>): AuditEntry {
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
    actor_id: row.actor_id ? String(row.actor_id) : null,
    actor_name: String(row.actor_name),
    actor_email: row.actor_email ? String(row.actor_email) : null,
    actor_role: String(row.actor_role),
    actor_legacy: Number(row.actor_legacy) === 1,
    action: String(row.action),
    entity_type: String(row.entity_type),
    entity_id: row.entity_id ? String(row.entity_id) : null,
    details,
    ip: row.ip ? String(row.ip) : null,
    created_at: String(row.created_at),
  };
}

export function insertAuditEntry(input: AuditInput, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    db.prepare(
      `INSERT INTO audit_log
         (id, actor_id, actor_name, actor_email, actor_role, actor_legacy,
          action, entity_type, entity_id, details, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `audit-${randomUUID()}`,
      input.actorId ?? null,
      input.actorName,
      input.actorEmail ?? null,
      input.actorRole,
      input.actorLegacy ? 1 : 0,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.details ?? {}),
      input.ip ?? null,
      new Date().toISOString()
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] insertAuditEntry failed:", err);
    return false;
  }
}

export function listAuditEntries(
  filters: AuditFilters = {},
  tenantId: string = DEFAULT_TENANT_ID
): AuditPage {
  try {
    const db = getDatabase(tenantId);
    const limit = Math.min(
      200,
      Math.max(1, Number.isFinite(filters.limit) ? Number(filters.limit) : 50)
    );
    const offset = Math.max(0, Number.isFinite(filters.offset) ? Number(filters.offset) : 0);

    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.action) {
      clauses.push("action = ?");
      params.push(filters.action);
    }
    if (filters.entityType) {
      clauses.push("entity_type = ?");
      params.push(filters.entityType);
    }
    if (filters.actorId) {
      clauses.push("actor_id = ?");
      params.push(filters.actorId);
    }
    if (filters.from) {
      clauses.push("created_at >= ?");
      params.push(filters.from);
    }
    if (filters.to) {
      clauses.push("created_at <= ?");
      params.push(filters.to);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const totalRow = db.prepare(`SELECT COUNT(*) as c FROM audit_log ${where}`).get(...params) as {
      c: number;
    };
    const rows = db
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Record<string, unknown>[];

    return {
      entries: rows.map(rowToAuditEntry),
      total: totalRow.c,
      limit,
      offset,
    };
  } catch (err) {
    console.error("[sqliteDb] listAuditEntries failed:", err);
    return { entries: [], total: 0, limit: 50, offset: 0 };
  }
}

// Audit records are retained for accountability, but the personal identifiers
// of a deleted staff actor are removed from the history.
export function anonymizeStaffAudit(staffId: string, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE audit_log
         SET actor_id = NULL, actor_name = 'Διαγραμμένος λογαριασμός', actor_email = NULL
         WHERE actor_id = ?`
      )
      .run(staffId);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] anonymizeStaffAudit failed:", err);
    return 0;
  }
}

export function purgeAuditLog(days: number = 365, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    if (!Number.isFinite(days) || days <= 0) return 0;
    const db = getDatabase(tenantId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(cutoff);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] purgeAuditLog failed:", err);
    return 0;
  }
}
