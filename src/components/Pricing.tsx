"use client";

import React, { useState } from "react";
import { useGymConfig } from "@/lib/useGymConfig";
import { PricingPlan } from "@/types";
import { formatEuro } from "@/lib/format";

interface PricingProps {
  onSelectPlan: (planName: string) => void;
  onOpenAIWizard: () => void;
}

export const Pricing: React.FC<PricingProps> = ({ onSelectPlan, onOpenAIWizard }) => {
  const { config } = useGymConfig();
  const [billingPeriod, setBillingPeriod] = useState<"month" | "quarter" | "year">("month");

  const planById = (id: string): PricingPlan =>
    config.pricing.find((p) => p.id === id) ?? config.pricing[0];
  const basePlan = planById("gym-pass");
  const aiPlan = planById("gym-plus-ai");

  const periodTotal = (plan: PricingPlan) =>
    billingPeriod === "month"
      ? plan.priceMonth
      : billingPeriod === "quarter"
      ? plan.priceQuarter ?? plan.priceMonth * 3
      : plan.priceYear ?? plan.priceMonth * 12;

  const periodLabel = billingPeriod === "month" ? "μήνα" : billingPeriod === "quarter" ? "τρίμηνο" : "έτος";

  const discountPct = (total: number | undefined, month: number) =>
    total && month ? Math.max(0, Math.round(100 - (total / (month * 3)) * 100)) : 0;

  const aiAddonDiff = Math.max(0, aiPlan.priceMonth - basePlan.priceMonth);

  return (
    <section id="pricing" className="py-16 border-b border-border bg-surface/40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-[11px] font-mono text-accent uppercase font-bold">
            Membership & Pricing
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
            Κόστος Συνδρομής & AI Add-on
          </h2>
          <p className="text-secondary text-xs sm:text-sm mt-1">
            Ενιαία πρόσβαση στο γυμναστήριο με επιλογή προσθήκης του AI Copilot.
          </p>
          <div className="mt-2 text-[11px] font-mono text-tertiary">
            * Οι εγγραφές και οι πληρωμές συνδρομών γίνονται αυτοπροσώπως στη ρεσεψιόν.
          </div>
        </div>

        {/* Billing Period Selector */}
        <div className="flex items-center justify-center mb-10">
          <div className="bg-surface p-1 rounded-lg border border-border inline-flex items-center gap-1">
            <button
              onClick={() => setBillingPeriod("month")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                billingPeriod === "month"
                  ? "bg-white text-black font-bold shadow-sm"
                  : "text-secondary hover:text-white"
              }`}
            >
              Μηνιαία
            </button>
            <button
              onClick={() => setBillingPeriod("quarter")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                billingPeriod === "quarter"
                  ? "bg-white text-black font-bold shadow-sm"
                  : "text-secondary hover:text-white"
              }`}
            >
              Τρίμηνη (-{discountPct(basePlan.priceQuarter, basePlan.priceMonth)}%)
            </button>
            <button
              onClick={() => setBillingPeriod("year")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                billingPeriod === "year"
                  ? "bg-white text-black font-bold shadow-sm"
                  : "text-secondary hover:text-white"
              }`}
            >
              Ετήσια (-{discountPct(basePlan.priceYear, basePlan.priceMonth)}%)
            </button>
          </div>
        </div>

        {/* 2-Column Comparison Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Option 1: Base Gym Membership */}
          <div className="p-6 rounded-xl bg-surface border border-border flex flex-col justify-between space-y-6">
            <div>
              <div className="text-[11px] font-mono uppercase text-tertiary mb-1">
                Standard Pass
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                {basePlan.name}
              </h3>
              <p className="text-secondary text-xs mb-6 leading-relaxed">
                Πλήρης πρόσβαση σε όλες τις ζώνες βαρών, cardio και ομαδικών μαθημάτων.
              </p>

              <div className="flex items-baseline gap-1.5 pb-6 mb-6 border-b border-border">
                <span className="text-4xl font-extrabold text-white font-mono">
                  {formatEuro(periodTotal(basePlan))}
                </span>
                <span className="text-xs text-secondary">/ {periodLabel}</span>
              </div>

              {/* Spec list */}
              <div className="space-y-2.5 text-xs text-secondary">
                {basePlan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2">
                    <span className="text-accent font-bold">—</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => onSelectPlan(basePlan.name)}
              className="w-full py-2.5 rounded-lg bg-surface-elevated hover:bg-border text-white text-xs font-semibold border border-border transition-colors text-center"
            >
              Πληροφορίες & Επίσκεψη στη Γραμματεία
            </button>
          </div>

          {/* Option 2: Membership + AI Copilot */}
          <div className="p-6 rounded-xl bg-surface-card border-2 border-border-light flex flex-col justify-between space-y-6 relative shadow-md">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono uppercase text-accent font-bold">
                  Recommended Combo
                </span>
                {aiAddonDiff > 0 && (
                  <span className="text-[10px] bg-accent text-black font-bold px-2 py-0.5 rounded-md">
                    +{formatEuro(aiAddonDiff)} AI Add-on
                  </span>
                )}
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                {aiPlan.name}
              </h3>
              <p className="text-secondary text-xs mb-6 leading-relaxed">
                Η συνδρομή γυμναστηρίου μαζί με το σύστημα παραγωγής εξατομικευμένων προγραμμάτων.
              </p>

              <div className="flex items-baseline gap-1.5 pb-6 mb-6 border-b border-border">
                <span className="text-4xl font-extrabold text-white font-mono">
                  {formatEuro(periodTotal(aiPlan))}
                </span>
                <span className="text-xs text-secondary">/ {periodLabel}</span>
              </div>

              {/* Spec list */}
              <div className="space-y-2.5 text-xs text-secondary">
                {aiPlan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2">
                    <span className="text-accent font-bold">—</span>
                    <span className="text-white">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => onSelectPlan(aiPlan.name)}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-black text-xs font-bold transition-colors text-center shadow-sm"
              >
                Ενεργοποίηση στη Ρεσεψιόν ({formatEuro(periodTotal(aiPlan))})
              </button>

              <button
                onClick={onOpenAIWizard}
                className="w-full py-1.5 text-secondary hover:text-white text-[11px] font-medium transition-colors text-center"
              >
                Δοκιμή AI Generator χωρίς εγγραφή
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
