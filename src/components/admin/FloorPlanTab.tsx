"use client";

/**
 * Admin tab for the gym floor plan (Phase 2 entry point).
 *
 * Unlike the other admin tabs this one does NOT persist through
 * `{ config, setConfig }`: the plan lives in its own `floor_plan` table and its
 * own endpoint pair, so a multi-hundred-kilobyte plan never rides along with an
 * unrelated config save. The tab therefore owns three things the editor must not:
 *
 *   - loading (`GET /api/admin/floor-plan`) and saving
 *     (`POST /api/admin/floor-plan`, `DELETE` to clear);
 *   - the dirty flag and the navigation guard;
 *   - turning the module's validation issues into UI state.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Save } from "lucide-react";
import { createEmptyPlan, type GymFloorPlan, type ValidationIssue } from "@/modules/gym-floor-plan";
import {
  clearFloorPlan,
  loadFloorPlan,
  saveFloorPlan,
  FloorPlanRequestError,
  FLOOR_PLAN_LOAD_ERROR,
  type LoadedFloorPlan,
} from "@/components/floor-plan/api";
import { FloorPlanEditor } from "@/components/floor-plan/FloorPlanEditor";

export const FLOOR_PLAN_ADMIN_ENDPOINT = "/api/admin/floor-plan";

/**
 * Last unsaved draft, kept for the lifetime of the page.
 *
 * The admin shell unmounts the inactive tab, so switching to "Συνδρομές" and back
 * would otherwise silently throw away an in-progress plan. Keeping the draft at
 * module scope (not in state, not in storage) survives that remount within one
 * page session and disappears on reload — the same lifetime as the dirty flag it
 * belongs to. It is never the source of truth: the server is, and the draft is
 * discarded as soon as a save or a clear succeeds.
 */
let unsavedDraft: { tenant: string; plan: GymFloorPlan } | null = null;

/**
 * Which tenant this page session belongs to.
 *
 * The server resolves the tenant from the request `Host` header, so the host the
 * browser is on IS the tenant key. Keying the draft by it is what stops a
 * multi-tenant admin session from carrying gym A's unsaved plan onto gym B's tab
 * and saving it there — the draft cache exists to survive a tab remount, not to
 * cross a tenant boundary.
 */
function currentTenantKey(): string {
  return typeof window === "undefined" ? "" : window.location.host.toLowerCase();
}

/** The draft for the current tenant, if any. */
function draftForCurrentTenant(): GymFloorPlan | null {
  if (!unsavedDraft) return null;
  return unsavedDraft.tenant === currentTenantKey() ? unsavedDraft.plan : null;
}

/**
 * Clears the module-level draft cache.
 *
 * Exported for tests only: the cache is intentionally invisible to the
 * component's props, so a test that renders the tab twice must be able to start
 * from a clean page session.
 */
export function resetFloorPlanDraftForTests(): void {
  unsavedDraft = null;
}

type LoadPhase = "loading" | "ready" | "error";

/** Structural comparison used for the dirty flag; plans are plain JSON. */
function plansEqual(a: GymFloorPlan | null, b: GymFloorPlan | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Registers the beforeunload guard while there are unsaved changes.
 *
 * `beforeunload` is the only hook a client component has for a full page
 * navigation; in-app tab switches are guarded in the admin page's tab buttons.
 */
function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome requires `returnValue` to be set for the prompt to appear.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

export const FloorPlanTab: React.FC = () => {
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<GymFloorPlan | null>(null);
  const [savedPlan, setSavedPlan] = useState<GymFloorPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ValidationIssue[]>([]);
  const [invalidStored, setInvalidStored] = useState(false);
  /** Bumped by the retry button to re-run the load effect. */
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Loads the stored plan.
   *
   * The state writes live in the promise callbacks rather than before the
   * `await`: that is what keeps the effect that calls this from performing a
   * synchronous `setState` during render-commit, which the repo's lint rules
   * reject. `reloadToken` re-runs the effect for the retry button.
   */
  const applyLoaded = useCallback((loaded: LoadedFloorPlan) => {
    const next = loaded.plan ?? createEmptyPlan();
    // A draft from this page session wins over the stored copy: the stored copy
    // is older by definition, and dropping the draft here is exactly what the
    // remount must not do.
    const draft = draftForCurrentTenant();
    if (draft) {
      setPlan(draft);
      setSavedPlan(next);
    } else {
      setPlan(next);
      setSavedPlan(next);
    }
    setInvalidStored(loaded.invalid);
    setPhase("ready");
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFloorPlan(FLOOR_PLAN_ADMIN_ENDPOINT, { cache: "no-store" })
      .then((loaded) => {
        if (cancelled) return;
        applyLoaded(loaded);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : FLOOR_PLAN_LOAD_ERROR);
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applyLoaded, reloadToken]);

  const retry = () => {
    setPhase("loading");
    setLoadError(null);
    setReloadToken((token) => token + 1);
  };

  const dirty = !plansEqual(plan, savedPlan);
  useUnsavedChangesGuard(dirty);

  const handleChange = (next: GymFloorPlan) => {
    setPlan(next);
    unsavedDraft = { tenant: currentTenantKey(), plan: next };
    setNotice(null);
    // Stale server issues describe the previous attempt, not the edited plan.
    setIssues([]);
  };

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    setIssues([]);
    setNotice(null);
    try {
      const result = await saveFloorPlan(FLOOR_PLAN_ADMIN_ENDPOINT, plan);
      unsavedDraft = null;
      setSavedPlan(plan);
      setWarnings(result.warnings);
      setNotice("Η κάτοψη αποθηκεύτηκε.");
    } catch (error) {
      if (error instanceof FloorPlanRequestError) {
        setIssues(error.issues);
        setNotice(error.message);
      } else {
        setNotice(error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setIssues([]);
    setNotice(null);
    try {
      await clearFloorPlan(FLOOR_PLAN_ADMIN_ENDPOINT);
      unsavedDraft = null;
      const empty = createEmptyPlan();
      setPlan(empty);
      setSavedPlan(empty);
      setWarnings([]);
      setNotice("Η κάτοψη διαγράφηκε. Μπορείς να ξεκινήσεις από την αρχή.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Η διαγραφή απέτυχε.");
    } finally {
      setClearing(false);
    }
  };

  const notices = useMemo(() => {
    const list: Array<{ tone: "ok" | "warn" | "error"; text: string }> = [];
    if (notice) list.push({ tone: "ok", text: notice });
    if (invalidStored) {
      list.push({
        tone: "warn",
        text: "Η αποθηκευμένη κάτοψη ήταν μη έγκυρη και δεν φορτώθηκε. Ξεκίνησε από κενή κάτοψη.",
      });
    }
    for (const warning of warnings) {
      list.push({ tone: "warn", text: warning.message });
    }
    return list;
  }, [notice, invalidStored, warnings]);

  if (phase === "loading") {
    return (
      <div className="p-8 rounded-xl bg-surface border border-border flex items-center justify-center gap-2 text-xs text-secondary">
        <LoaderCircle className="w-4 h-4 animate-spin" />
        Φόρτωση κάτοψης...
      </div>
    );
  }

  if (phase === "error" || !plan) {
    return (
      <div className="p-6 rounded-xl bg-surface border border-border space-y-3 text-center">
        <p className="text-xs text-red-300 flex items-center justify-center gap-1.5">
          <AlertCircle className="w-4 h-4" />
          {loadError ?? FLOOR_PLAN_LOAD_ERROR}
        </p>
        <button
          type="button"
          onClick={retry}
          className="px-3 py-1.5 rounded-sm bg-btn hover:bg-btn-hover text-btn-ink text-xs font-bold inline-flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          Δοκιμή ξανά
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notices.length > 0 && (
        <div className="space-y-1.5">
          {notices.map((entry, index) => (
            <div
              key={`${entry.tone}-${index}`}
              className={`p-2.5 rounded-sm border text-[11px] flex items-start gap-2 ${
                entry.tone === "error"
                  ? "bg-red-950/40 border-red-800/60 text-red-300"
                  : entry.tone === "warn"
                    ? "bg-amber-950/30 border-amber-800/60 text-amber-200"
                    : "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
              }`}
            >
              {entry.tone === "ok" ? (
                <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              )}
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      )}

      <FloorPlanEditor
        plan={plan}
        onChange={handleChange}
        onSave={() => void handleSave()}
        saving={saving}
        dirty={dirty}
        serverIssues={issues}
        onClear={() => void handleClear()}
        clearing={clearing}
      />
    </div>
  );
};
