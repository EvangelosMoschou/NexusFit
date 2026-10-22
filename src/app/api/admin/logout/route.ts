import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/adminAuth";
import { SECURE_COOKIES } from "@/lib/cookies";

// Clears the admin session cookie, which the client can not do itself
// (it is HttpOnly).
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIES,
    maxAge: 0,
  });
  return res;
}
