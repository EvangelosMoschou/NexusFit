import React from "react";
import Link from "next/link";
import { LogIn, ShieldCheck, Users } from "lucide-react";
import { StatusPage } from "@/components/status/StatusPage";

export default function UnauthorizedPage() {
  return (
    <StatusPage
      code="401"
      tone="warning"
      title="Χρειάζεται σύνδεση"
      description="Η συνεδρία σου έληξε, ανακλήθηκε ή δεν έχεις συνδεθεί ακόμα. Συνδέσου ξανά για να συνεχίσεις."
      actions={
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-left">
          <Link
            href="/?login=1"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
              <LogIn className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-primary">Σύνδεση μέλους</div>
              <div className="text-[11px] text-secondary">Κωδικός μέλους ή email + PIN</div>
            </div>
          </Link>

          <Link
            href="/admin"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-primary">Διαχείριση</div>
              <div className="text-[11px] text-secondary">Σύνδεση διαχειριστή</div>
            </div>
          </Link>

          <Link
            href="/trainer"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-primary">Προσωπικό</div>
              <div className="text-[11px] text-secondary">Σύνδεση γυμναστή</div>
            </div>
          </Link>
        </div>
      }
    />
  );
}
