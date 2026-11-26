import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { authenticateMemberSession } from "@/lib/memberSessions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// Returns the signed-in member's live profile, subscription status, and saved
// workout plans so admin changes propagate without logging out.
export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const session = await authenticateMemberSession(req, tenantId);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const member = await getRepository(tenantId).getMemberById(session.memberId);
  if (!member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, member },
    { headers: { "Cache-Control": "no-store" } }
  );
}
