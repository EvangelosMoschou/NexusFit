import { NextRequest, NextResponse } from "next/server";
import {
  buildAdminSessionCookie,
  adminCredentialsConfigured,
  verifyAdminPassword,
} from "@/lib/adminAuth";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    // The password is checked against the tenant that owns this host, so every
    // gym has its own admin credentials.
    const tenantId = resolveTenantIdFromHeaders(req.headers);

    if (!adminCredentialsConfigured(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Tenant not configured" },
        { status: 503 }
      );
    }

    // A single admin password guards the whole console; stop offline guessing.
    const limit = checkRateLimit(
      `login:admin:${tenantId}:${getClientIp(req.headers)}`,
      5,
      60_000
    );
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Πολλές προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε λίγο.",
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const { password } = body;

    if (!password || !verifyAdminPassword(tenantId, password)) {
      return NextResponse.json(
        { success: false, error: "Λανθασμένος κωδικός διαχειριστή." },
        { status: 401 }
      );
    }

    const cookie = buildAdminSessionCookie(tenantId);
    const res = NextResponse.json({ success: true, message: "Authorized" });
    if (cookie) {
      res.headers.set("Set-Cookie", cookie);
    }
    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
