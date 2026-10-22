import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { signMemberId } from "@/lib/session";
import { MEMBER_COOKIE, SECURE_COOKIES } from "@/lib/cookies";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier, pin } = body;

    if (!identifier || !pin) {
      return NextResponse.json(
        { success: false, error: "Συμπληρώστε τον κωδικό μέλους και το PIN." },
        { status: 400 }
      );
    }

    const member = await getRepository(resolveTenantIdFromHeaders(req.headers)).authenticateMember(
      identifier,
      pin
    );

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Λανθασμένος κωδικός μέλους ή PIN." },
        { status: 401 }
      );
    }

    const token = signMemberId(member.id);
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Ο διακομιστής δεν έχει ρυθμιστεί για ασφαλείς συνεδρίες." },
        { status: 503 }
      );
    }

    const res = NextResponse.json({ success: true, member });
    res.cookies.set({
      name: MEMBER_COOKIE,
      value: token,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: SECURE_COOKIES,
      maxAge: 2592000,
    });
    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: "Σφάλμα βάσης δεδομένων." },
      { status: 500 }
    );
  }
}
