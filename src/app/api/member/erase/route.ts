import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { verifyMemberSession } from "@/lib/session";
import { MEMBER_COOKIE, SECURE_COOKIES } from "@/lib/cookies";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// GDPR right to erasure: deletes the signed-in member, all of their stored
// workout plans (via ON DELETE CASCADE) and any lead inquiries sharing their
// email address, then clears the session cookie.
export async function DELETE(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const memberId = verifyMemberSession(req.cookies.get(MEMBER_COOKIE)?.value, tenantId);

  if (!memberId) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const deleted = await getRepository(tenantId).eraseMember(memberId);

  const res = NextResponse.json({ success: deleted });
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
