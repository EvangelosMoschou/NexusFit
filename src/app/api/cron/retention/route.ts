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
  for (const tenant of tenants) {
    removed += await getRepository(tenant.id).purgeExpiredLeads();
  }

  return NextResponse.json({ success: true, removed, tenants: tenants.length });
}
