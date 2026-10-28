import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    const limit = checkRateLimit(
      `leads:${tenantId}:${getClientIp(req.headers)}`,
      10,
      10 * 60_000
    );
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Πολλά αιτήματα. Δοκιμάστε ξανά σε λίγα λεπτά.",
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const { fullName, email, phone, goal, preferredPlan, notes } = body;

    if (!fullName || !email) {
      return NextResponse.json(
        { success: false, error: "Συμπληρώστε ονοματεπώνυμο και email." },
        { status: 400 }
      );
    }

    const saved = await getRepository(tenantId).saveLead({
      fullName,
      email,
      phone,
      goal,
      preferredPlan,
      notes,
    });

    return NextResponse.json({ success: saved });
  } catch {
    return NextResponse.json(
      { success: false, error: "Database error saving lead inquiry" },
      { status: 500 }
    );
  }
}
