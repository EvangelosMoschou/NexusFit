import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isSubscriptionActive } from "@/lib/subscription";
import { reentryCooldownMessage } from "@/lib/accessToken";
import { isQuickReentry, trackAccessEvent } from "@/lib/accessEvents";

// Physical check-in point (a tablet at the entrance). It does not create a
// member session: the PIN is verified for this single action only.
export async function POST(req: NextRequest) {
  try {
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    const body = await req.json().catch(() => ({}));
    const { identifier, pin, action } = body;

    if (!identifier || !pin || (action !== "in" && action !== "out")) {
      return NextResponse.json(
        { success: false, error: "Συμπληρώστε κωδικό, PIN και ενέργεια." },
        { status: 400 }
      );
    }

    const ipLimit = checkRateLimit(
      `kiosk:ip:${tenantId}:${getClientIp(req.headers)}`,
      20,
      60_000
    );
    const idLimit = checkRateLimit(
      `kiosk:id:${tenantId}:${String(identifier).trim().toLowerCase()}`,
      5,
      60_000
    );
    if (!ipLimit.allowed || !idLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, idLimit.retryAfterSeconds, 1);
      return NextResponse.json(
        { success: false, error: "Πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const repo = getRepository(tenantId);
    const member = await repo.authenticateMember(String(identifier), String(pin));

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Λανθασμένος κωδικός μέλους ή PIN." },
        { status: 401 }
      );
    }

    const active = isSubscriptionActive(
      member.subscription.status,
      member.subscription.expiresAt
    );
    const premium = active && member.subscription.hasAIAccess;

    if (action === "in" && !active) {
      return NextResponse.json(
        {
          success: false,
          locked: true,
          subscriptionActive: false,
          error: "Η συνδρομή σου δεν είναι ενεργή. Επικοινώνησε με τη ρεσεψιόν.",
        },
        { status: 403 }
      );
    }

    let wasInside = false;
    let lastCheckoutAt: string | null = null;

    if (action === "in") {
      const visit = await repo.getMemberVisitStatus(member.id);
      wasInside = visit.inside;
      if (!visit.inside) {
        const cooldownSeconds = await repo.getReentryCooldownSeconds(member.id);
        if (cooldownSeconds > 0) {
          return NextResponse.json(
            {
              success: false,
              locked: false,
              error: reentryCooldownMessage(cooldownSeconds),
              retryAfterSeconds: cooldownSeconds,
            },
            { status: 429 }
          );
        }
        lastCheckoutAt = await repo.getLastCheckoutAt(member.id);
      }
    }

    const result =
      action === "in" ? await repo.checkInMember(member.id) : await repo.checkOutMember(member.id);

    if (result.status === "unknown") {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }

    if (action === "in") {
      if (wasInside || result.status === "already_in") {
        await trackAccessEvent(req, tenantId, member.id, "duplicate_entry", {
          direction: "in",
          source: "kiosk",
        });
      } else if (result.status === "in" && isQuickReentry(lastCheckoutAt)) {
        await trackAccessEvent(req, tenantId, member.id, "quick_reentry", {
          direction: "in",
          source: "kiosk",
          lastCheckoutAt,
        });
      }
    }

    // Count/capacity are Premium-only; check-in remains available to any active
    // subscription.
    const occupancy = premium ? await repo.getOccupancy() : null;
    return NextResponse.json({
      success: true,
      locked: !premium,
      subscriptionActive: active,
      memberName: member.fullName,
      memberCode: member.memberCode,
      status: result.status,
      occupancy,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
