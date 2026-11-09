import { NextRequest, NextResponse } from "next/server";
import { MEMBER_COOKIE, SECURE_COOKIES } from "@/lib/cookies";
import {
  revokeAllMemberSessions,
  revokeCurrentMemberSession,
  writeMemberSessionAudit,
} from "@/lib/memberSessions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// Revokes the server-side session (not just the browser cookie) and clears the
// HttpOnly cookie. `{ "all": true }` logs the member out of every device.
export async function POST(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const body = await req.json().catch(() => ({}));
  const all = body?.all === true;

  const memberId = await revokeCurrentMemberSession(req, tenantId);
  if (all && memberId) {
    const revokedOtherSessions = await revokeAllMemberSessions(tenantId, memberId);
    await writeMemberSessionAudit(req, tenantId, memberId, "member.session.logout_all", {
      revokedOtherSessions,
    });
  } else if (memberId) {
    await writeMemberSessionAudit(req, tenantId, memberId, "member.session.logout");
  }

  const res = NextResponse.json({ success: true, all });
  res.cookies.set({
    name: MEMBER_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIES,
    maxAge: 0,
  });
  return res;
}
