import { NextRequest, NextResponse } from "next/server";
import {
  buildTrainerSessionCookie,
  legacyTrainerSession,
  trainerCredentialsConfigured,
  verifyTrainerPassword,
} from "@/lib/trainerAuth";
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
    const tenantId = resolveTenantIdFromHeaders(req.headers);

    const limit = checkRateLimit(
      `login:trainer:${tenantId}:${getClientIp(req.headers)}`,
      5,
      60_000
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: "Πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const password = body?.password;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (email) {
      const emailLimit = checkRateLimit(
        `login:trainer:email:${tenantId}:${email}`,
        5,
        60_000
      );
      if (!emailLimit.allowed) {
        return NextResponse.json(
          { success: false, error: "Πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο." },
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
        "trainer"
      );
      if (!account) {
        return NextResponse.json(
          { success: false, error: "Λανθασμένο email ή κωδικός προσωπικού." },
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

    if (!trainerCredentialsConfigured(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Η πρόσβαση προσωπικού δεν έχει ρυθμιστεί." },
        { status: 503 }
      );
    }

    if (!password || !(await verifyTrainerPassword(tenantId, String(password)))) {
      return NextResponse.json(
        { success: false, error: "Λανθασμένος κωδικός προσωπικού." },
        { status: 401 }
      );
    }

    const cookie = buildTrainerSessionCookie(tenantId);
    if (!cookie) {
      return NextResponse.json(
        { success: false, error: "Το session δεν έχει ρυθμιστεί (SESSION_SECRET)." },
        { status: 503 }
      );
    }

    await writeAudit(req, tenantId, legacyTrainerSession(), "auth.login", "trainer", null, {
      legacy: true,
    });

    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", cookie);
    return res;
  } catch {
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
