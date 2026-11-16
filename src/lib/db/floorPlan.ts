import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { FloorPlanRecord } from "./types";

// The gym floor plan, stored as ONE raw JSON string in its own `floor_plan`
// table.
//
// It deliberately lives outside `site_config` under key `gym_config`: that blob
// is downloaded by every visitor through GET /api/config (a large plan would add
// hundreds of kilobytes), and it is rewritten by every unrelated admin save.
//
// The plan's *format* is owned by the portable `@/modules/gym-floor-plan`
// module. This data layer therefore never parses, validates or imports it — it
// only stores and returns the string. Validation happens at the HTTP boundary
// (`parsePlanValue` / `serializePlan`), which is what keeps the module portable
// and this layer swappable.
//
// One plan per tenant database: the row id is always FLOOR_PLAN_ROW_ID.

/** The single row id. Per-tenant databases mean one plan per gym. */
const FLOOR_PLAN_ROW_ID = "default";

const EMPTY_FLOOR_PLAN: FloorPlanRecord = { json: null, updatedAt: null };

export function getFloorPlanJson(tenantId: string = DEFAULT_TENANT_ID): FloorPlanRecord {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare("SELECT plan_json, updated_at FROM floor_plan WHERE id = ?")
      .get(FLOOR_PLAN_ROW_ID) as { plan_json: string; updated_at: string } | undefined;
    if (!row) return { ...EMPTY_FLOOR_PLAN };
    return { json: row.plan_json, updatedAt: row.updated_at };
  } catch (err) {
    console.error("[sqliteDb] getFloorPlanJson failed:", err);
    return { ...EMPTY_FLOOR_PLAN };
  }
}

export function saveFloorPlanJson(json: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare(`
      INSERT INTO floor_plan (id, plan_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        plan_json = excluded.plan_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(FLOOR_PLAN_ROW_ID, json, new Date().toISOString());
    return true;
  } catch (err) {
    console.error("[sqliteDb] saveFloorPlanJson failed:", err);
    return false;
  }
}

export function deleteFloorPlan(tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db.prepare("DELETE FROM floor_plan WHERE id = ?").run(FLOOR_PLAN_ROW_ID);
    return Number(result.changes ?? 0) > 0;
  } catch (err) {
    console.error("[sqliteDb] deleteFloorPlan failed:", err);
    return false;
  }
}
