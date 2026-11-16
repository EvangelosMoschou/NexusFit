"use client";

/**
 * Public, read-only gym floor plan.
 *
 * Distinct from `GymMap.tsx`, which embeds the OpenStreetMap location. This is
 * the owner-drawn plan: category-coloured squares, floor tabs, a full legend and
 * a print stylesheet.
 *
 * Data flow is deliberately tiny — one `GET /api/floor-plan`, validated with the
 * module's `parsePlanValue`, then `buildFloorRenderModel` per floor. The plan is
 * NOT part of the `gym_config` blob (that would add hundreds of kilobytes to
 * every visitor's payload), so it is fetched separately and the section renders
 * nothing at all when the gym has not drawn one.
 */

import React, { useEffect, useMemo, useState } from "react";
import { buildLegend, type GymFloorPlan as GymFloorPlanData } from "@/modules/gym-floor-plan";
import { loadFloorPlan } from "@/components/floor-plan/api";
import { FloorPlanCanvas } from "@/components/floor-plan/FloorPlanCanvas";
import { FloorPlanLegend } from "@/components/floor-plan/FloorPlanLegend";
import { FloorPlanPrintStyles } from "@/components/floor-plan/FloorPlanPrintStyles";
import { FloorPlanTabs } from "@/components/floor-plan/FloorPlanTabs";
import { GREEK_FLOOR_PLAN_LABELS } from "@/components/floor-plan/labels";
import { useFloorPlanTheme } from "@/components/floor-plan/useFloorPlanTheme";

export const FLOOR_PLAN_PUBLIC_ENDPOINT = "/api/floor-plan";

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error" }
  | { status: "ready"; plan: GymFloorPlanData };

export const GymFloorPlan: React.FC = () => {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const theme = useFloorPlanTheme();

  useEffect(() => {
    // The `active` flag guards the unmount race: a landing-page section can be
    // torn down while the request is still in flight.
    let active = true;

    loadFloorPlan(FLOOR_PLAN_PUBLIC_ENDPOINT)
      .then(({ plan }) => {
        if (!active) return;
        setState(plan ? { status: "ready", plan } : { status: "empty" });
      })
      .catch(() => {
        if (!active) return;
        setState({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, []);

  const plan = state.status === "ready" ? state.plan : null;

  const selectedFloorId = useMemo(() => {
    if (!plan) return null;
    if (activeFloorId && plan.floors.some((floor) => floor.id === activeFloorId)) {
      return activeFloorId;
    }
    return plan.floors[0]?.id ?? null;
  }, [plan, activeFloorId]);

  const legend = useMemo(() => {
    if (!plan || !selectedFloorId) return [];
    return buildLegend(plan, selectedFloorId, theme, GREEK_FLOOR_PLAN_LABELS);
  }, [plan, selectedFloorId, theme]);

  if (state.status === "loading") {
    // A neutral skeleton: the plan is an optional section, so there is nothing
    // to explain while it loads.
    return (
      <section
        id="floor-plan"
        aria-busy="true"
        className="py-16 border-b border-border bg-surface/50"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-6 w-48 rounded-sm skeleton-box" />
          <div className="mt-4 h-64 w-full rounded-xl skeleton-box" />
        </div>
      </section>
    );
  }

  // No plan drawn yet (or the stored one fails validation): the landing page
  // simply has no plan section. A public visitor has no use for an error panel.
  if (!plan || !selectedFloorId) return null;

  const selectedFloor = plan.floors.find((floor) => floor.id === selectedFloorId);
  const hasCategories = plan.categories.length > 0;

  return (
    <section id="floor-plan" className="py-16 border-b border-border bg-surface/50">
      <FloorPlanPrintStyles />
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-8">
          <span className="text-[11px] font-mono text-accent uppercase font-bold">
            Κάτοψη Γυμναστηρίου
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight mt-1">
            {plan.title}
          </h2>
          <p className="text-secondary text-xs sm:text-sm mt-1">
            Χρωματικές ζώνες εξοπλισμού ανά όροφο. Κάθε χρώμα συνοδεύεται από σύντομη ετικέτα και
            υπόμνημα, ώστε η κάτοψη να διαβάζεται και χωρίς χρώμα.
          </p>
        </div>

        {plan.floors.length > 1 && (
          <div className="mb-4">
            <FloorPlanTabs
              floors={plan.floors}
              activeFloorId={selectedFloorId}
              onSelect={setActiveFloorId}
              label="Όροφοι κάτοψης"
            />
          </div>
        )}

        {!hasCategories ? (
          <div className="p-6 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
            Η κάτοψη δεν έχει οριστεί ακόμη.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
            <FloorPlanCanvas
              plan={plan}
              floorId={selectedFloorId}
              theme={theme}
              labels={GREEK_FLOOR_PLAN_LABELS}
              legendMode="none"
            />
            <aside className="rounded-xl bg-surface border border-border p-4 space-y-2">
              <h3 className="text-xs font-bold text-primary">Υπόμνημα</h3>
              <FloorPlanLegend entries={legend} />
              {selectedFloor && (
                <p className="text-[10px] text-tertiary pt-2 border-t border-border font-mono">
                  {selectedFloor.rows} × {selectedFloor.cols} τετράγωνα
                </p>
              )}
            </aside>
          </div>
        )}
      </div>
    </section>
  );
};
