import { NextResponse } from "next/server";
import { MEMBER_COOKIE, SECURE_COOKIES } from "@/lib/cookies";

// Clears the signed member session cookie. The client can not clear an HttpOnly
// cookie itself, so logout has to round-trip through the server.
export async function POST() {
  const res = NextResponse.json({ success: true });
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
