import React from "react";
import Link from "next/link";
import { Calendar, Home } from "lucide-react";
import { StatusPage } from "@/components/status/StatusPage";

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="Η σελίδα δεν βρέθηκε"
      description="Φαίνεται ότι η διεύθυνση που αναζητάτε δεν υπάρχει ή έχει μετακινηθεί. Μην ανησυχείτε, η προπόνηση συνεχίζεται!"
      actions={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 text-left">
          <Link
            href="/"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
              <Home className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-primary">Αρχική Σελίδα</div>
              <div className="text-[11px] text-secondary">Επιστροφή στην αρχική σελίδα</div>
            </div>
          </Link>

          <Link
            href="/#schedule"
            className="p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors group flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-surface-elevated text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-primary">Πρόγραμμα Ομαδικών</div>
              <div className="text-[11px] text-secondary">Δείτε το εβδομαδιαίο ωρολόγιο</div>
            </div>
          </Link>
        </div>
      }
    />
  );
}
