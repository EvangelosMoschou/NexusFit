import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { adminRoute } from "@/lib/api";

export const GET = adminRoute(
  async (_req, tenantId) =>
    NextResponse.json({ success: true, config: await getRepository(tenantId).getGymConfig() }),
  "Failed to load config"
);

export const POST = adminRoute(async (req: NextRequest, tenantId: string) => {
  const body = await req.json();
  const { config } = body;

  if (!config) {
    return NextResponse.json({ success: false, error: "Missing config data" }, { status: 400 });
  }

  const updated = await getRepository(tenantId).updateGymConfig(config);
  return NextResponse.json({ success: updated });
}, "Failed to update config");
