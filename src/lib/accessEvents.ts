import type { NextRequest } from "next/server";
import { getRepository } from "@/lib/db";
import { writeSystemAudit } from "@/lib/audit";

export const ACCESS_ALERT_WINDOW_DAYS = 7;
// More than one event in the rolling window raises the alert.
export const ACCESS_ALERT_THRESHOLD = 1;
// Exit and re-entry inside this window is considered a suspicious quick return.
export const QUICK_REENTRY_MINUTES = 30;

export function isQuickReentry(lastCheckoutAt: string | null): boolean {
  if (!lastCheckoutAt) return false;
  const timestamp = Date.parse(lastCheckoutAt);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= QUICK_REENTRY_MINUTES * 60_000;
}

export async function trackAccessEvent(
  req: NextRequest | null,
  tenantId: string,
  memberId: string,
  eventType: "duplicate_entry" | "quick_reentry",
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const repo = getRepository(tenantId);
    const inserted = await repo.recordAccessEvent(memberId, eventType, {
      ...details,
      quickReentryMinutes: QUICK_REENTRY_MINUTES,
    });
    if (!inserted) return;

    const count = await repo.countAccessEvents(
      memberId,
      ACCESS_ALERT_WINDOW_DAYS
    );
    if (count === ACCESS_ALERT_THRESHOLD + 1) {
      await writeSystemAudit(
        req,
        tenantId,
        "access.alert",
        "member",
        memberId,
        {
          eventType,
          eventCount: count,
          windowDays: ACCESS_ALERT_WINDOW_DAYS,
        },
        "Σύστημα παρακολούθησης"
      );
    }
  } catch (error) {
    console.error("[accessEvents] failed to record event:", error);
  }
}
