import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { authenticateMemberSession } from "@/lib/memberSessions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

export async function POST(req: NextRequest) {
  try {
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    const session = await authenticateMemberSession(req, tenantId);
    if (!session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const memberId = session.memberId;

    const body = await req.json();
    const { plan } = body;

    if (!plan) {
      return NextResponse.json({ success: false, error: "Missing plan" }, { status: 400 });
    }

    const saved = await getRepository(tenantId).saveWorkoutPlan(memberId, plan);
    return NextResponse.json({ success: saved });
  } catch {
    return NextResponse.json(
      { success: false, error: "Database error saving workout" },
      { status: 500 }
    );
  }
}
