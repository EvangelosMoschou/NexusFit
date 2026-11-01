"use client";

import React, { useEffect, useState } from "react";
import { Lock, Users } from "lucide-react";

interface OccupancyState {
  locked: boolean;
  inside: number;
  capacity: number;
}

export const OccupancyBadge: React.FC = () => {
  const [state, setState] = useState<OccupancyState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/occupancy", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok && data.success) {
          setState({
            locked: Boolean(data.locked),
            inside: data.inside ?? 0,
            capacity: data.capacity ?? 0,
          });
        }
      } catch {
        // Not critical: the badge stays hidden.
      }
    };

    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!state) return null;

  if (state.locked) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-elevated border border-border text-[11px] font-semibold text-secondary"
        title="Συνδεθείτε με Premium συνδρομή για να δείτε πόσοι είναι μέσα."
      >
        <Lock className="w-3 h-3 text-accent" />
        <span>Πληρότητα για Premium μέλη</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-elevated border border-border text-[11px] font-semibold text-secondary">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <Users className="w-3 h-3 text-accent" />
      <span>
        Μέσα τώρα: <strong className="text-primary">{state.inside}</strong>
        {state.capacity > 0 ? ` / ${state.capacity}` : ""}
      </span>
    </span>
  );
};
