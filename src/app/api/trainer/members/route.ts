import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { trainerRoute } from "@/lib/api";

export const GET = trainerRoute(async (req, tenantId) => {
  const repo = getRepository(tenantId);
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const detail = await repo.exportMember(id);
    if (!detail.member) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }
    await repo.closeIdleVisits();
    const visits = await repo.getMemberVisits(id, 10);
    return NextResponse.json({
      success: true,
      member: detail.member,
      plans: detail.plans,
      visits,
    });
  }

  return NextResponse.json({ success: true, members: await repo.listMembers() });
}, "Failed to fetch members", "members_view");
