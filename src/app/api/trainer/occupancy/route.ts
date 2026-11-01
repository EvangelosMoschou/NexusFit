import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { trainerRoute } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export const GET = trainerRoute(async (_req, tenantId) => {
  const repo = getRepository(tenantId);
  await repo.closeIdleVisits();
  await repo.closeStaleVisits();
  const [occupancy, members, recentVisits] = await Promise.all([
    repo.getOccupancy(),
    repo.getInsideMembers(),
    repo.getRecentVisits(40),
  ]);

  return NextResponse.json({ success: true, ...occupancy, members, recentVisits });
}, "Failed to fetch occupancy", "occupancy_view");

export const POST = trainerRoute(async (req: NextRequest, tenantId: string, staff) => {
  const body = await req.json().catch(() => ({}));
  const memberId = body?.memberId;
  const action = body?.action;

  if (!memberId || (action !== "in" && action !== "out")) {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const repo = getRepository(tenantId);
  const result =
    action === "in"
      ? await repo.checkInMember(String(memberId))
      : await repo.checkOutMember(String(memberId));

  await writeAudit(
    req,
    tenantId,
    staff,
    action === "in" ? "occupancy.check_in" : "occupancy.check_out",
    "occupancy",
    String(memberId),
    { status: result.status }
  );

  const occupancy = await repo.getOccupancy();
  return NextResponse.json({ success: true, status: result.status, occupancy });
}, "Failed to update occupancy", "occupancy_manage");
