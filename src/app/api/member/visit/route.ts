import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { authenticateMemberSession } from "@/lib/memberSessions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { isPremiumSubscriptionActive, isSubscriptionActive } from "@/lib/subscription";
import { reentryCooldownMessage } from "@/lib/accessToken";
import { isQuickReentry, trackAccessEvent } from "@/lib/accessEvents";

async function authenticatedMember(req: NextRequest, tenantId: string): Promise<string | null> {
  const session = await authenticateMemberSession(req, tenantId);
  return session?.memberId ?? null;
}

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const memberId = await authenticatedMember(req, tenantId);

  if (!memberId) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const repo = getRepository(tenantId);
  const member = await repo.getMemberAccess(memberId);
  if (!member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  const active = isSubscriptionActive(member.subscription_status, member.expires_at);
  const premium = isPremiumSubscriptionActive(
    member.subscription_status,
    member.expires_at,
    member.has_ai_access
  );
  await repo.closeIdleVisits();

  const [status, occupancy, visits30d] = await Promise.all([
    repo.getMemberVisitStatus(memberId),
    premium ? repo.getOccupancy() : Promise.resolve(null),
    active ? repo.getMemberVisitCount(memberId, 30) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    success: true,
    locked: !premium,
    subscriptionActive: active,
    inside: status.inside,
    since: status.since,
    occupancy,
    visits30d,
  });
}

export async function POST(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const memberId = await authenticatedMember(req, tenantId);

  if (!memberId) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  const repo = getRepository(tenantId);
  const member = await repo.getMemberAccess(memberId);
  if (!member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  const active = isSubscriptionActive(member.subscription_status, member.expires_at);
  const premium = isPremiumSubscriptionActive(
    member.subscription_status,
    member.expires_at,
    member.has_ai_access
  );

  if (action === "heartbeat") {
    const touched = await repo.touchMemberVisit(memberId);
    if (touched) {
      return NextResponse.json({
        success: true,
        locked: !premium,
        subscriptionActive: active,
        touched: true,
        inside: true,
      });
    }
    const status = await repo.getMemberVisitStatus(memberId);
    return NextResponse.json({
      success: true,
      locked: !premium,
      subscriptionActive: active,
      touched: false,
      inside: status.inside,
      since: status.since,
    });
  }

  if (action !== "in" && action !== "out") {
    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  }

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
    const visit = await repo.getMemberVisitStatus(memberId);
    wasInside = visit.inside;
    if (!visit.inside) {
      const cooldownSeconds = await repo.getReentryCooldownSeconds(memberId);
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
      lastCheckoutAt = await repo.getLastCheckoutAt(memberId);
    }
  }

  const result =
    action === "in" ? await repo.checkInMember(memberId) : await repo.checkOutMember(memberId);

  if (result.status === "unknown") {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  if (action === "in") {
    if (wasInside || result.status === "already_in") {
      await trackAccessEvent(req, tenantId, memberId, "duplicate_entry", {
        direction: "in",
        source: "portal",
      });
    } else if (result.status === "in" && isQuickReentry(lastCheckoutAt)) {
      await trackAccessEvent(req, tenantId, memberId, "quick_reentry", {
        direction: "in",
        source: "portal",
        lastCheckoutAt,
      });
    }
  }

  const [occupancy, visits30d] = await Promise.all([
    premium ? repo.getOccupancy() : Promise.resolve(null),
    active ? repo.getMemberVisitCount(memberId, 30) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    success: true,
    locked: !premium,
    subscriptionActive: active,
    status: result.status,
    since: result.visit?.checked_in_at ?? null,
    occupancy,
    visits30d,
  });
}
