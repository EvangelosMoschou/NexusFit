import { NextRequest, NextResponse } from "next/server";
import { MEMBER_COOKIE, SECURE_COOKIES } from "@/lib/cookies";
import {
  authenticateMemberSession,
  listActiveMemberSessions,
  revokeMemberSessionById,
  writeMemberSessionAudit,
} from "@/lib/memberSessions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// List only this member's active sessions. The id is the SHA-256 hash stored in
// the database; the raw session id never leaves the signed cookie.
export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const sessions = await listActiveMemberSessions(req, tenantId);
  if (!sessions) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ success: true, sessions });
}

// Revoke one session by its hashed id. Revoking the current session also clears
// the browser cookie; other devices are unaffected.
export async function DELETE(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const session = await authenticateMemberSession(req, tenantId);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid session id" }, { status: 400 });
  }

  const revoked = await revokeMemberSessionById(tenantId, session.memberId, id);
  if (!revoked) {
    return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
  }

  const revokedCurrent = id === session.sessionIdHash;
  await writeMemberSessionAudit(req, tenantId, session.memberId, "member.session.revoke", {
    session: id.slice(0, 12),
    current: revokedCurrent,
  });

  const res = NextResponse.json({
    success: true,
    revokedCurrent,
  });

  if (revokedCurrent) {
    res.cookies.set({
      name: MEMBER_COOKIE,
      value: "",
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: SECURE_COOKIES,
      maxAge: 0,
    });
  }

  return res;
}
