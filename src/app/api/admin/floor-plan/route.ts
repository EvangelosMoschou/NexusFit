import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getRepository } from "@/lib/db";
import { describeDecodeFailure, planCodec, validateIncomingPlan } from "../../floor-plan/codec";

// Admin CRUD for the gym floor plan.
//
// This handler moves OPAQUE BYTES only: it validates what comes in, encodes it
// to bytes with the codec seam (`../floor-plan/codec`), and stores those bytes;
// on read it takes the decompressed payload back from the repository and
// decodes it. The on-disk encoding (gzip today, a packed binary format later)
// never leaks past the codec, so this file does not change when it does.
//
// Validation and canonical encoding still happen here — not in the data layer —
// which is what keeps `src/lib/db/**` format-agnostic.

/** Reads the stored plan for the editor. Invalid stored values are not served. */
export const GET = adminRoute(async (_req, tenantId) => {
  const record = await getRepository(tenantId).getFloorPlanPayload();
  if (!record.payload) {
    return NextResponse.json({ success: true, plan: null, updatedAt: null });
  }

  const result = planCodec.decode(record.payload);
  if (!result.ok) {
    console.error(`[api/admin/floor-plan] ${describeDecodeFailure(planCodec, result)}`);
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

  let encoded: Uint8Array;
  try {
    // Canonical form: known fields only, fixed key order, current schema
    // version. Validation already passed, so this cannot throw in practice.
    encoded = planCodec.encode(parsed.plan);
  } catch (err) {
    console.error(`[api/admin/floor-plan] ${planCodec.name} encode failed:`, err);
    return NextResponse.json({ success: false, error: "Invalid floor plan" }, { status: 400 });
  }

  const saved = await getRepository(tenantId).saveFloorPlanPayload(encoded);
  if (!saved) {
    return NextResponse.json(
      { success: false, error: "Failed to save floor plan" },
      { status: 500 }
    );
  }

  await writeAudit(req, tenantId, staff, "floorplan.update", "floorplan", null, {
    floors: parsed.plan.floors.length,
    categories: parsed.plan.categories.length,
    bytes: encoded.byteLength,
    format: planCodec.name,
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
