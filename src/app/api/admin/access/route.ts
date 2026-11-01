import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/api";
import { getRepository } from "@/lib/db";
import {
  ACCESS_ALERT_THRESHOLD,
  ACCESS_ALERT_WINDOW_DAYS,
  QUICK_REENTRY_MINUTES,
} from "@/lib/accessEvents";

export const GET = adminRoute(async (_req, tenantId) => {
  const repo = getRepository(tenantId);
  const [alerts, recentEvents] = await Promise.all([
    repo.listAccessAlerts(ACCESS_ALERT_THRESHOLD, ACCESS_ALERT_WINDOW_DAYS),
    repo.listRecentAccessEvents(50),
  ]);

  return NextResponse.json({
    success: true,
    alerts,
    recentEvents,
    threshold: ACCESS_ALERT_THRESHOLD,
    windowDays: ACCESS_ALERT_WINDOW_DAYS,
    quickReentryMinutes: QUICK_REENTRY_MINUTES,
  });
}, "Failed to fetch access monitoring");
