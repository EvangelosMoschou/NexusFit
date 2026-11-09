"use client";

import React, { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { StatusPage } from "@/components/status/StatusPage";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled route error:", error);
  }, [error]);

  return (
    <StatusPage
      code="500"
      tone="danger"
      title="Κάτι πήγε στραβά"
      description="Η σελίδα δεν φορτώθηκε σωστά. Δοκίμασε ξανά — αν το πρόβλημα συνεχιστεί, επικοινώνησε με τη ρεσεψιόν."
      actions={
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-surface border border-border hover:border-border-light text-primary font-bold text-xs transition-colors"
          >
            <RotateCcw className="w-4 h-4 text-accent" />
            <span>Δοκιμή ξανά</span>
          </button>
        </div>
      }
    />
  );
}
