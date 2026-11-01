import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isSubscriptionActive } from "@/lib/subscription";
import {
  accessControlConfigured,
  reentryCooldownMessage,
  verifyAccessDeviceKey,
  verifyAccessToken,
} from "@/lib/accessToken";
import { writeSystemAudit } from "@/lib/audit";
import { isQuickReentry, trackAccessEvent } from "@/lib/accessEvents";

export async function POST(req: NextRequest) {
  if (!accessControlConfigured()) {
    return NextResponse.json(
      { success: false, allowed: false, reason: "not_configured" },
      { status: 503 }
    );
  }

  const providedKey = req.headers.get("x-access-key") ?? undefined;
  if (!verifyAccessDeviceKey(providedKey)) {
    return NextResponse.json(
      { success: false, allowed: false, reason: "invalid_device_key" },
      { status: 401 }
    );
  }

  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const ipLimit = checkRateLimit(
    `access:ip:${tenantId}:${getClientIp(req.headers)}`,
    120,
    60_000
  );
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { success: false, allowed: false, reason: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const direction = body?.direction;

  if (!token || (direction !== "in" && direction !== "out")) {
    return NextResponse.json(
      { success: false, allowed: false, reason: "invalid_payload" },
      { status: 400 }
    );
  }

  const payload = verifyAccessToken(token, tenantId);
  if (!payload) {
    await writeSystemAudit(req, tenantId, "access.denied", "access", null, {
      direction,
      reason: "invalid_token",
    });
    return NextResponse.json(
      { success: false, allowed: false, reason: "invalid_token" },
      { status: 403 }
    );
  }

  const memberLimit = checkRateLimit(
    `access:member:${tenantId}:${payload.memberId}`,
    20,
    60_000
  );
  if (!memberLimit.allowed) {
    return NextResponse.json(
      { success: false, allowed: false, reason: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(memberLimit.retryAfterSeconds) },
      }
    );
  }

  const repo = getRepository(tenantId);
  const member = await repo.getMemberAccess(payload.memberId);
  if (!member) {
    await writeSystemAudit(req, tenantId, "access.denied", "access", null, {
      direction,
      reason: "member_not_found",
    });
    return NextResponse.json(
      { success: false, allowed: false, reason: "member_not_found" },
      { status: 404 }
    );
  }

  const deny = async (reason: string, status: number, extra = {}) => {
    await writeSystemAudit(req, tenantId, "access.denied", "member", member.id, {
      direction,
      reason,
    });
    return NextResponse.json(
      { success: false, allowed: false, reason, ...extra },
      { status }
    );
  };

  const active = isSubscriptionActive(
    member.subscription_status,
    member.expires_at
  );
  const visit = await repo.getMemberVisitStatus(member.id);

  if (direction === "out") {
    if (!visit.inside) {
      return deny("not_inside", 409);
    }

    const result = await repo.checkOutMember(member.id);
    if (result.status !== "out") {
      return deny("not_inside", 409);
    }
    const occupancy = await repo.getOccupancy();
    return NextResponse.json({
      success: true,
      allowed: true,
      direction,
      memberName: member.full_name,
      memberCode: member.member_code,
      status: "out",
      occupancy,
    });
  }

  if (!active) {
    return deny("subscription_inactive", 403);
  }
  if (visit.inside) {
    await trackAccessEvent(req, tenantId, member.id, "duplicate_entry", {
      direction: "in",
    });
    return deny("already_inside", 409);
  }

  const cooldownSeconds = await repo.getReentryCooldownSeconds(member.id);
  if (cooldownSeconds > 0) {
    return deny("cooldown", 429, {
      retryAfterSeconds: cooldownSeconds,
      message: reentryCooldownMessage(cooldownSeconds),
    });
  }

  const lastCheckoutAt = await repo.getLastCheckoutAt(member.id);
  const result = await repo.checkInMember(member.id);
  if (result.status === "unknown") {
    return deny("member_not_found", 404);
  }
  if (result.status === "already_in") {
    await trackAccessEvent(req, tenantId, member.id, "duplicate_entry", {
      direction: "in",
    });
    return deny("already_inside", 409);
  }

  if (isQuickReentry(lastCheckoutAt)) {
    await trackAccessEvent(req, tenantId, member.id, "quick_reentry", {
      direction: "in",
      lastCheckoutAt,
    });
  }

  const occupancy = await repo.getOccupancy();
  return NextResponse.json({
    success: true,
    allowed: true,
    direction,
    memberName: member.full_name,
    memberCode: member.member_code,
    status: "in",
    occupancy,
  });
}
