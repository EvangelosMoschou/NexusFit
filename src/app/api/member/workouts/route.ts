import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { verifyMemberSession } from "@/lib/session";
import { MEMBER_COOKIE } from "@/lib/cookies";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

export async function POST(req: NextRequest) {
  try {
    const memberId = verifyMemberSession(req.cookies.get(MEMBER_COOKIE)?.value);

    if (!memberId) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { plan } = body;

    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Missing plan" },
        { status: 400 }
      );
    }

    const saved = await getRepository(resolveTenantIdFromHeaders(req.headers)).saveWorkoutPlan(
      memberId,
      plan
    );
    return NextResponse.json({ success: saved });
  } catch {
    return NextResponse.json(
      { success: false, error: "Database error saving workout" },
      { status: 500 }
    );
  }
}
