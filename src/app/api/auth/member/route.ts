import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { signMemberId } from "@/lib/session";
import { MEMBER_COOKIE, SECURE_COOKIES } from "@/lib/cookies";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    const body = await req.json();
    const { identifier, pin } = body;

    if (!identifier || !pin) {
      return NextResponse.json(
        { success: false, error: "Συμπληρώστε τον κωδικό μέλους και το PIN." },
        { status: 400 }
      );
    }

    // PINs are short, so the login endpoint needs a brake: one bucket per
    // source address and a tighter one per member code, both per tenant.
    const ipLimit = checkRateLimit(
      `login:member:ip:${tenantId}:${getClientIp(req.headers)}`,
      20,
      60_000
    );
    const idLimit = checkRateLimit(
      `login:member:id:${tenantId}:${String(identifier).trim().toLowerCase()}`,
      5,
      60_000
    );
    if (!ipLimit.allowed || !idLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, idLimit.retryAfterSeconds, 1);
      return NextResponse.json(
        {
          success: false,
          error: "Πολλές προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε λίγο.",
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const member = await getRepository(tenantId).authenticateMember(identifier, pin);

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
