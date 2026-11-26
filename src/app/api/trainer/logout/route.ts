import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE, TRAINER_COOKIE, SECURE_COOKIES } from "@/lib/cookies";
import { revokeStaffSessionCookie } from "@/lib/staffAuth";
import { revokeTrainerSession } from "@/lib/trainerAuth";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

export async function POST(req?: NextRequest) {
  if (req) {
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    revokeTrainerSession(req, tenantId);
    await revokeStaffSessionCookie(req, tenantId);
  }

  const res = NextResponse.json({ success: true });
  for (const name of [TRAINER_COOKIE, STAFF_COOKIE]) {
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
