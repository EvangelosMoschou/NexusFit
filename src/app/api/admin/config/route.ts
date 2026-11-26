import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { adminRoute } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export const GET = adminRoute(
  async (_req, tenantId) =>
    NextResponse.json({ success: true, config: await getRepository(tenantId).getGymConfig() }),
  "Failed to load config"
);

const MAX_CONFIG_BYTES = 262_144;
const NUMERIC_LIMITS: Array<{
  key: string;
  min: number;
  max: number;
}> = [
  { key: "maxCapacity", min: 1, max: 100_000 },
  { key: "idleCheckoutMinutes", min: 0, max: 1_440 },
  { key: "reentryCooldownMinutes", min: 0, max: 1_440 },
  { key: "latitude", min: -90, max: 90 },
  { key: "longitude", min: -180, max: 180 },
];

export const POST = adminRoute(async (req: NextRequest, tenantId: string, staff) => {
  const body = await req.json();
  const { config } = body;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return NextResponse.json({ success: false, error: "Missing config data" }, { status: 400 });
  }

  if (Buffer.byteLength(JSON.stringify(config), "utf8") > MAX_CONFIG_BYTES) {
    return NextResponse.json(
      { success: false, error: "Config payload exceeds size limit" },
      { status: 400 }
    );
  }

  const record = config as Record<string, unknown>;
  for (const { key, min, max } of NUMERIC_LIMITS) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      return NextResponse.json(
        { success: false, error: `Invalid numeric config field: ${key}` },
        { status: 400 }
      );
    }
  }

  const updated = await getRepository(tenantId).updateGymConfig(config);
  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Failed to update config" },
      { status: 500 }
    );
  }

  await writeAudit(req, tenantId, staff, "config.update", "config", null, {
    fields: Object.keys(config),
  });
  return NextResponse.json({ success: true });
}, "Failed to update config");
