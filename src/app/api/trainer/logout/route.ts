import { NextResponse } from "next/server";
import { STAFF_COOKIE, TRAINER_COOKIE, SECURE_COOKIES } from "@/lib/cookies";

export async function POST() {
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
