import { NextRequest, NextResponse } from "next/server";
import {
  buildAdminSessionCookie,
  adminCredentialsConfigured,
  verifyAdminPassword,
} from "@/lib/adminAuth";
import {
  authenticateStaff,
  buildStaffSessionCookie,
  staffAccountToSession,
} from "@/lib/staffAuth";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { writeAudit } from "@/lib/audit";

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
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (email) {
      const emailLimit = checkRateLimit(
        `login:admin:email:${tenantId}:${email}`,
        5,
        60_000
      );
      if (!emailLimit.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "Πολλές προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε λίγο.",
          },
          {
            status: 429,
            headers: { "Retry-After": String(emailLimit.retryAfterSeconds) },
          }
        );
      }

      if (!password) {
        return NextResponse.json(
          { success: false, error: "Συμπληρώστε email και κωδικό." },
          { status: 400 }
        );
      }

      const account = await authenticateStaff(
        email,
        String(password),
        tenantId,
        "admin"
      );
      if (!account) {
        return NextResponse.json(
          { success: false, error: "Λανθασμένο email ή κωδικός διαχειριστή." },
          { status: 401 }
        );
      }

      const cookie = buildStaffSessionCookie(tenantId, account);
      if (!cookie) {
        return NextResponse.json(
          { success: false, error: "Το session δεν έχει ρυθμιστεί (SESSION_SECRET)." },
          { status: 503 }
        );
      }

      const session = staffAccountToSession(account);
      await writeAudit(req, tenantId, session, "auth.login", "staff", account.id, {
        role: account.role,
      });

      const res = NextResponse.json({ success: true, staff: session });
      res.headers.set("Set-Cookie", cookie);
      return res;
    }

    if (!password || !(await verifyAdminPassword(tenantId, password))) {
      return NextResponse.json(
        { success: false, error: "Λανθασμένος κωδικός διαχειριστή." },
        { status: 401 }
      );
    }

    const cookie = buildAdminSessionCookie(tenantId);
    if (!cookie) {
      return NextResponse.json(
        { success: false, error: "Το session δεν έχει ρυθμιστεί (SESSION_SECRET)." },
        { status: 503 }
      );
    }

    await writeAudit(req, tenantId, null, "auth.login", "admin", null, {
      legacy: true,
    });

    const res = NextResponse.json({ success: true, message: "Authorized" });
    res.headers.set("Set-Cookie", cookie);
    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
