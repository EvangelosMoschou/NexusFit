import { createHash } from "node:crypto";
import { getRepository } from "@/lib/db";
import type { MemberAccess } from "@/lib/db/types";
import type { GymConfig } from "@/types";

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function expiryDays(expiresAt: string): number | null {
  const date = expiresAt.slice(0, 10);
  const expiry = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(expiry)) return null;

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((expiry - today) / 86_400_000);
}

// Notifications are derived from the member's current state and gym config, so
// they work for existing announcements/schedules too. Dedupe keys make this
// idempotent; changing an announcement or the schedule creates a new entry.
export async function ensureMemberNotifications(
  tenantId: string,
  member: MemberAccess,
  config: GymConfig
): Promise<void> {
  const repo = getRepository(tenantId);
  const days = expiryDays(member.expires_at);

  if (days !== null) {
    if (member.subscription_status !== "active" || days < 0) {
      await repo.ensureMemberNotification(member.id, {
        type: "expiry",
        title: "Η συνδρομή σου έχει λήξει",
        body: "Επικοινώνησε με τη ρεσεψιόν για ανανέωση και συνέχισε την πρόσβασή σου.",
        dedupeKey: `expiry:${member.expires_at.slice(0, 10)}:expired`,
      });
    } else if (days <= 14) {
      await repo.ensureMemberNotification(member.id, {
        type: "expiry",
        title:
          days === 0
            ? "Η συνδρομή σου λήγει σήμερα"
            : `Η συνδρομή σου λήγει σε ${days} ${days === 1 ? "ημέρα" : "ημέρες"}`,
        body: "Πέρασε από τη ρεσεψιόν για ανανέωση, ώστε να μη χάσεις την πρόσβαση.",
        dedupeKey: `expiry:${member.expires_at.slice(0, 10)}:soon`,
      });
    }
  }

  for (const announcement of config.announcements ?? []) {
    const hash = shortHash(
      `${announcement.title}|${announcement.body}|${announcement.level}`
    );
    await repo.ensureMemberNotification(member.id, {
      type: "announcement",
      title: announcement.title,
      body: announcement.body || "Δες την ανακοίνωση στην αρχική σελίδα.",
      dedupeKey: `announcement:${announcement.id}:${hash}`,
    });
  }

  if ((config.schedule ?? []).length > 0) {
    const hash = shortHash(JSON.stringify(config.schedule));
    await repo.ensureMemberNotification(member.id, {
      type: "schedule",
      title: "Ενημέρωση προγράμματος",
      body: "Το εβδομαδιαίο πρόγραμμα ενημερώθηκε. Δες τις ώρες και τους χώρους.",
      dedupeKey: `schedule:${hash}`,
    });
  }
}
