"use client";

import React, { Dispatch, SetStateAction } from "react";
import { GymConfig } from "@/types";

interface PricingTabProps {
  config: GymConfig;
  setConfig: Dispatch<SetStateAction<GymConfig>>;
}

// TAB 3: PRICING & PLANS EDITOR
export const PricingTab: React.FC<PricingTabProps> = ({ config, setConfig }) => {
  const updatePlan = (planIdx: number, patch: Partial<GymConfig["pricing"][number]>) => {
    setConfig((prev) => ({
      ...prev,
      pricing: prev.pricing.map((p, i) => (i === planIdx ? { ...p, ...patch } : p)),
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-white">Τιμοκατάλογος & Παροχές Συνδρομών</h2>
        <p className="text-xs text-secondary">Αλλάξτε τις τιμές και τις παροχές των πακέτων με απόλυτη ασφάλεια.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {config.pricing.map((plan, planIdx) => (
          <div key={plan.id} className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="text-[10px] font-mono text-accent uppercase font-bold">
                Πλάνο #{planIdx + 1}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={plan.popular}
                  onChange={(e) => updatePlan(planIdx, { popular: e.target.checked })}
                />
                <span>Δημοφιλές Πλαίσιο</span>
              </label>
            </div>

            <div>
              <label className="block text-[11px] text-secondary mb-1">Όνομα Συνδρομής</label>
              <input
                type="text"
                value={plan.name}
                onChange={(e) => updatePlan(planIdx, { name: e.target.value })}
                className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs font-bold outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-tertiary mb-1">Μηνιαία (€)</label>
                <input
                  type="number"
                  value={plan.priceMonth}
                  onChange={(e) => updatePlan(planIdx, { priceMonth: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-white text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-tertiary mb-1">Τρίμηνη (€)</label>
                <input
                  type="number"
                  value={plan.priceQuarter || 0}
                  onChange={(e) => updatePlan(planIdx, { priceQuarter: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-white text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-tertiary mb-1">Ετήσια (€)</label>
                <input
                  type="number"
                  value={plan.priceYear || 0}
                  onChange={(e) => updatePlan(planIdx, { priceYear: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-white text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-secondary mb-1">Παροχές (Μία ανά γραμμή)</label>
              <textarea
                rows={4}
                value={plan.features.join("\n")}
                onChange={(e) => updatePlan(planIdx, { features: e.target.value.split("\n").filter(Boolean) })}
                className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs outline-none font-sans"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
