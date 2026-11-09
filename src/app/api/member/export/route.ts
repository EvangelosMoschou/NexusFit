import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { authenticateMemberSession } from "@/lib/memberSessions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// GDPR right of access / portability: returns the signed-in member's own data
// as a downloadable JSON file.
export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const session = await authenticateMemberSession(req, tenantId);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  const memberId = session.memberId;

  const repo = getRepository(tenantId);
  const data = await repo.exportMember(memberId);
  if (!data.member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }
  const [visits, notifications, accessEvents, sessions] = await Promise.all([
    repo.getMemberVisits(memberId, 1000),
    repo.listMemberNotifications(memberId, 1000),
    repo.listMemberAccessEvents(memberId, 1000),
    repo.listMemberSessionHistory(memberId, 1000),
  ]);

  return NextResponse.json(
    {
      success: true,
      exportedAt: new Date().toISOString(),
      ...data,
      visits,
      notifications,
      accessEvents,
      sessions,
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="nexusfit-data-${memberId}.json"`,
      },
    }
  );
}
