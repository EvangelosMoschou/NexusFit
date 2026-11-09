import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { listTenants } from "@/lib/tenants";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Scheduled retention job: deletes lead inquiries older than the retention
// window. Call from a cron sidecar with the shared CRON_SECRET header.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }

  if (!secretsMatch(req.headers.get("x-cron-secret") ?? "", secret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Retention applies to every tenant, not just the default one.
  const tenants = listTenants();
  let removed = 0;
  let visitsClosed = 0;
  let idleVisitsClosed = 0;
  let auditPurged = 0;
  let accessEventsPurged = 0;
  let memberSessionsPurged = 0;
  const now = Date.now();
  for (const tenant of tenants) {
    const repo = getRepository(tenant.id);
    removed += await repo.purgeExpiredLeads();
    idleVisitsClosed += await repo.closeIdleVisits();
    visitsClosed += await repo.closeStaleVisits();
    auditPurged += await repo.purgeAudit(365);
    accessEventsPurged += await repo.purgeAccessEvents(365);
    memberSessionsPurged += await repo.purgeMemberSessions(now);
  }

  return NextResponse.json({
    success: true,
    removed,
    visitsClosed,
    idleVisitsClosed,
    auditPurged,
    accessEventsPurged,
    memberSessionsPurged,
    tenants: tenants.length,
  });
}
