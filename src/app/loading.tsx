import React from "react";
import { Dumbbell } from "lucide-react";
import { defaultGymConfig } from "@/config/gymConfig";

export default function Loading() {
  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6"
      role="status"
      aria-live="polite"
    >
      <div className="w-12 h-12 rounded-xl bg-accent text-accent-ink flex items-center justify-center shadow-lg animate-pulse">
        <Dumbbell className="w-6 h-6 stroke-[2.5]" />
      </div>
      <div className="text-center space-y-1">
        <div className="text-sm font-bold text-primary uppercase tracking-tight">
          {defaultGymConfig.gymName}
        </div>
        <div className="text-xs text-tertiary">Φόρτωση…</div>
      </div>
    </div>
  );
}
