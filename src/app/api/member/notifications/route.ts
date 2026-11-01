import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { verifyMemberSession } from "@/lib/session";
import { MEMBER_COOKIE } from "@/lib/cookies";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { ensureMemberNotifications } from "@/lib/memberNotifications";

function authenticatedMember(req: NextRequest, tenantId: string): string | null {
  return verifyMemberSession(req.cookies.get(MEMBER_COOKIE)?.value, tenantId);
}

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const memberId = authenticatedMember(req, tenantId);

  if (!memberId) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const repo = getRepository(tenantId);
  const member = await repo.getMemberAccess(memberId);
  if (!member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  await ensureMemberNotifications(tenantId, member, await repo.getGymConfig());

  const [notifications, unreadCount] = await Promise.all([
    repo.listMemberNotifications(memberId, 50),
    repo.getUnreadNotificationCount(memberId),
  ]);

  return NextResponse.json({ success: true, notifications, unreadCount });
}

export async function POST(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const memberId = authenticatedMember(req, tenantId);

  if (!memberId) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const repo = getRepository(tenantId);

  if (body?.markAll === true) {
    await repo.markAllMemberNotificationsRead(memberId);
  } else if (typeof body?.id === "string" && body.id) {
    await repo.markMemberNotificationRead(memberId, body.id);
  } else {
    return NextResponse.json(
      { success: false, error: "Missing notification id" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    unreadCount: await repo.getUnreadNotificationCount(memberId),
  });
}
