import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// Public copy of the admin-editable gym config (pricing, schedule, info).
export async function GET(req: NextRequest) {
  try {
    const config = await getRepository(resolveTenantIdFromHeaders(req.headers)).getGymConfig();
    return NextResponse.json({ success: true, config });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load config" }, { status: 500 });
  }
}
