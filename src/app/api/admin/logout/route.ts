import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminAuth";
import { STAFF_COOKIE, SECURE_COOKIES } from "@/lib/cookies";

// Clears both the legacy admin cookie and the staff-account cookie, which the
// client cannot do itself (they are HttpOnly).
export async function POST() {
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
