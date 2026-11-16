import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getRepository } from "@/lib/db";
import { deserializePlan, parsePlanValue, serializePlan } from "@/modules/gym-floor-plan";
import type { DeserializeResult, GymFloorPlan } from "@/modules/gym-floor-plan";

// Admin CRUD for the gym floor plan.
//
// The stored row is a raw JSON string; the plan FORMAT is owned by the portable
// `@/modules/gym-floor-plan` module. This handler is the only place the two meet:
// it validates what comes in with `parsePlanValue`, re-serializes it
// canonically with `serializePlan`, and only ever stores that canonical string —
// so the data layer stays format-agnostic and stored plans stay diffable.

/**
 * Validates whatever the editor sent.
 *
 * The editor normally posts the plan as an object, but a JSON string is also
 * accepted (e.g. a client that round-trips the serialized form) so callers do
 * not have to know which representation the endpoint prefers.
 */
function validateIncomingPlan(value: unknown): DeserializeResult {
  if (typeof value === "string") return deserializePlan(value);
  return parsePlanValue(value);
}

/** Reads the stored plan for the editor. Invalid stored values are not served. */
export const GET = adminRoute(async (_req, tenantId) => {
  const record = await getRepository(tenantId).getFloorPlanJson();
  if (!record.json) {
    return NextResponse.json({ success: true, plan: null, updatedAt: null });
  }

  const result = deserializePlan(record.json);
  if (!result.ok) {
    console.error(
      `[api/admin/floor-plan] stored floor plan is invalid: ${result.issues[0]?.code ?? "unknown"}`
    );
    return NextResponse.json({
      success: true,
      plan: null,
      invalid: true,
      updatedAt: record.updatedAt,
    });
  }

  return NextResponse.json({
    success: true,
    plan: result.plan,
    warnings: result.warnings,
    updatedAt: record.updatedAt,
  });
}, "Failed to load floor plan");

export const POST = adminRoute(async (req: NextRequest, tenantId: string, staff) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const planInput = (body as { plan?: unknown } | null)?.plan;
  if (planInput === undefined || planInput === null) {
    return NextResponse.json({ success: false, error: "Missing plan data" }, { status: 400 });
  }

  const parsed = validateIncomingPlan(planInput);
  if (!parsed.ok) {
    // The module's own machine-readable issues, so the editor can highlight the
    // offending cell instead of parsing a message string.
    return NextResponse.json(
      {
        success: false,
        error: "Invalid floor plan",
        message: parsed.issues[0]?.message,
        issues: parsed.issues,
      },
      { status: 400 }
    );
  }

  let serialized: string;
  try {
    // Canonical form: known fields only, fixed key order, current schema
    // version. Validation already passed, so this cannot throw in practice.
    serialized = serializePlan(parsed.plan);
  } catch (err) {
    console.error("[api/admin/floor-plan] serializePlan failed:", err);
    return NextResponse.json({ success: false, error: "Invalid floor plan" }, { status: 400 });
  }

  const saved = await getRepository(tenantId).saveFloorPlanJson(serialized);
  if (!saved) {
    return NextResponse.json(
      { success: false, error: "Failed to save floor plan" },
      { status: 500 }
    );
  }

  await writeAudit(req, tenantId, staff, "floorplan.update", "floorplan", null, {
    floors: (parsed.plan as GymFloorPlan).floors.length,
    categories: (parsed.plan as GymFloorPlan).categories.length,
    bytes: serialized.length,
    warnings: parsed.warnings.length,
  });

  return NextResponse.json({ success: true, warnings: parsed.warnings });
}, "Failed to save floor plan");

export const DELETE = adminRoute(async (req: NextRequest, tenantId: string, staff) => {
  const removed = await getRepository(tenantId).deleteFloorPlan();
  if (removed) {
    await writeAudit(req, tenantId, staff, "floorplan.delete", "floorplan", null, {});
  }
  // Idempotent: clearing a plan that is already absent is still a success.
  return NextResponse.json({ success: true, removed });
}, "Failed to delete floor plan");
