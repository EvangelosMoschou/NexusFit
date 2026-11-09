import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { authenticateMemberSession } from "@/lib/memberSessions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { ensureMemberNotifications } from "@/lib/memberNotifications";

async function authenticatedMember(req: NextRequest, tenantId: string): Promise<string | null> {
  const session = await authenticateMemberSession(req, tenantId);
  return session?.memberId ?? null;
}

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const memberId = await authenticatedMember(req, tenantId);

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
  const memberId = await authenticatedMember(req, tenantId);

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
    return NextResponse.json({ success: false, error: "Missing notification id" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    unreadCount: await repo.getUnreadNotificationCount(memberId),
  });
}
