import { getDatabase } from "./connection";
import {
  compressPlanPayload,
  decompressPlanPayload,
  PAYLOAD_FORMAT_NAME,
} from "./floorPlanCompression";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { FloorPlanPayload } from "./types";

// The gym floor plan, stored as ONE gzipped payload in its own `floor_plan`
// table.
//
// It deliberately lives outside `site_config` under key `gym_config`: that blob
// is downloaded by every visitor through GET /api/config (a large plan would add
// hundreds of kilobytes), and it is rewritten by every unrelated admin save.
//
// The plan's *format* is owned by the portable `@/modules/gym-floor-plan`
// module. This data layer therefore never parses, validates or imports it — it
// receives opaque bytes, gzips them (see `./floorPlanCompression`), and returns
// the same bytes after inflating. That is what makes the stored row 37-132x
// smaller than the plain-text form it replaced, and what keeps the module
// portable and this layer swappable.
//
// One plan per tenant database: the row id is always FLOOR_PLAN_ROW_ID.

/** The single row id. Per-tenant databases mean one plan per gym. */
const FLOOR_PLAN_ROW_ID = "default";

const EMPTY_FLOOR_PLAN: FloorPlanPayload = { payload: null, format: null, updatedAt: null };

/**
 * Reads the tenant's plan payload, decompressed.
 *
 * An absent row, an unreadable blob (wrong magic, truncated gzip, over the size
 * cap) and a failed query all resolve to the empty record instead of throwing:
 * the HTTP layer already has a "no plan" response, and a corrupt row must not
 * become a 500.
 */
export function getFloorPlanPayload(tenantId: string = DEFAULT_TENANT_ID): FloorPlanPayload {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare("SELECT payload, payload_format, updated_at FROM floor_plan WHERE id = ?")
      .get(FLOOR_PLAN_ROW_ID) as
      { payload: Uint8Array | null; payload_format: string | null; updated_at: string } | undefined;
    if (!row || row.payload === null || row.payload === undefined) {
      return { ...EMPTY_FLOOR_PLAN };
    }

    const payload = decompressPlanPayload(row.payload);
    if (!payload) {
      console.error("[sqliteDb] getFloorPlanPayload failed: unreadable floor plan payload");
      return { ...EMPTY_FLOOR_PLAN };
    }

    return {
      payload,
      format: row.payload_format ?? PAYLOAD_FORMAT_NAME,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    console.error("[sqliteDb] getFloorPlanPayload failed:", err);
    return { ...EMPTY_FLOOR_PLAN };
  }
}

/**
 * Compresses and stores the tenant's plan payload, replacing any previous one.
 *
 * `payload` is opaque: whatever the codec produced. An empty `Uint8Array` is a
 * legitimate value and is stored as such.
 */
export function saveFloorPlanPayload(
  payload: Uint8Array,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    if (!(payload instanceof Uint8Array)) {
      console.error("[sqliteDb] saveFloorPlanPayload failed: payload is not a Uint8Array");
      return false;
    }

    const db = getDatabase(tenantId);
    const stmt = db.prepare(`
      INSERT INTO floor_plan (id, payload, payload_format, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        payload_format = excluded.payload_format,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      FLOOR_PLAN_ROW_ID,
      compressPlanPayload(payload),
      PAYLOAD_FORMAT_NAME,
      new Date().toISOString()
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] saveFloorPlanPayload failed:", err);
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
