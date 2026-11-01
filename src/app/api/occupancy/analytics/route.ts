import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { canViewOccupancy } from "@/lib/occupancyAccess";
import { computeOccupancyAnalytics } from "@/lib/occupancyAnalytics";

const TIMEZONE = process.env.GYM_TIMEZONE || "Europe/Athens";

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);

  if (!(await canViewOccupancy(req, tenantId))) {
    return NextResponse.json({
      success: true,
      locked: true,
      timezone: TIMEZONE,
      updatedAt: new Date().toISOString(),
    });
  }

  const requestedWeeks = Number(req.nextUrl.searchParams.get("weeks") ?? 8);
  const weeks = Number.isFinite(requestedWeeks)
    ? Math.min(26, Math.max(1, Math.round(requestedWeeks)))
    : 8;

  const repo = getRepository(tenantId);
  const config = await repo.getGymConfig();
  const since = new Date(
    Date.now() - weeks * 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const visits = await repo.getVisitIntervalsSince(since);
  const analytics = computeOccupancyAnalytics(
    visits,
    weeks,
    config.capacity,
    TIMEZONE
  );

  return NextResponse.json({
    success: true,
    locked: false,
    ...analytics,
    updatedAt: new Date().toISOString(),
  });
}
