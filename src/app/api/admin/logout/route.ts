import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, revokeAdminSession } from "@/lib/adminAuth";
import { STAFF_COOKIE, SECURE_COOKIES } from "@/lib/cookies";
import { revokeStaffSessionCookie } from "@/lib/staffAuth";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// Clears both the legacy admin cookie and the staff-account cookie, which the
// client cannot do itself (they are HttpOnly), and revokes the server-side
// sessions when invoked with a request.
export async function POST(req?: NextRequest) {
  if (req) {
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    revokeAdminSession(req, tenantId);
    await revokeStaffSessionCookie(req, tenantId);
  }

  const res = NextResponse.json({ success: true });
  for (const name of [ADMIN_COOKIE, STAFF_COOKIE]) {
    res.cookies.set({
      name,
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
