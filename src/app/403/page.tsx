import React from "react";
import Link from "next/link";
import { Mail, ShieldX } from "lucide-react";
import { StatusPage } from "@/components/status/StatusPage";

export default function ForbiddenPage() {
  return (
    <StatusPage
      code="403"
      tone="danger"
      title="Δεν έχεις πρόσβαση"
      description="Ο λογαριασμός σου δεν έχει το απαιτούμενο δικαίωμα για αυτή την ενέργεια. Αν πιστεύεις ότι είναι λάθος, επικοινώνησε με τη ρεσεψιόν."
      actions={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 text-left">
          <Link
            href="/#contact"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-primary">Επικοινωνία</div>
              <div className="text-[11px] text-secondary">Μίλα με τη ρεσεψιόν</div>
            </div>
          </Link>

          <Link
            href="/"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
              <ShieldX className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-primary">Αρχική</div>
              <div className="text-[11px] text-secondary">Επιστροφή στο γυμναστήριο</div>
            </div>
          </Link>
        </div>
      }
    />
  );
}
