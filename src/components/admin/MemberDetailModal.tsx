"use client";

import React, { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { Barcode } from "@/components/Barcode";
import { useEscapeKey } from "@/lib/useEscapeKey";

interface MemberDetail {
  id: string;
  member_code: string;
  full_name: string;
  email: string;
  tier_name: string;
  has_ai_access: number;
  subscription_status: string;
  expires_at: string;
  created_at: string;
}

interface PlanSummary {
  id?: string;
  splitName?: string;
  daysPerWeek?: number;
  sessionDuration?: number;
  createdAt?: string;
}

interface VisitSummary {
  id: string;
  checked_in_at: string;
  checked_out_at: string | null;
}

interface ExerciseLogSummary {
  id: number;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  logged_at: string;
}

interface MemberDetailModalProps {
  memberId: string;
  onClose: () => void;
  // The trainer area reuses this modal with its permission-guarded endpoint.
  endpoint?: string;
  onUpdated?: () => void;
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("el-GR");
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function extendExpiryByMonths(currentIso: string, months: number): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const baseIso = /^\d{4}-\d{2}-\d{2}$/.test(currentIso) && currentIso > todayIso ? currentIso : todayIso;
  const date = new Date(`${baseIso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({
  memberId,
  onClose,
  endpoint = "/api/admin/members",
  onUpdated,
}) => {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = endpoint === "/api/admin/members";
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    fullName: "",
    email: "",
    tierName: "",
    expiresAt: "",
    subscriptionStatus: "active" as "active" | "expired",
    hasAIAccess: false,
    pinCode: "",
  });

  useEscapeKey(true, onClose);

  const syncFormFromMember = (nextMember: MemberDetail) => {
    setFormState({
      fullName: nextMember.full_name,
      email: nextMember.email,
      tierName: nextMember.tier_name,
      expiresAt: nextMember.expires_at,
      subscriptionStatus: nextMember.subscription_status === "expired" ? "expired" : "active",
      hasAIAccess: nextMember.has_ai_access === 1,
      pinCode: "",
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`${endpoint}?id=${encodeURIComponent(memberId)}`);
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.success && data.member) {
          setMember(data.member);
          syncFormFromMember(data.member);
          setPlans(Array.isArray(data.plans) ? data.plans : []);
          setVisits(Array.isArray(data.visits) ? data.visits : []);
          setExerciseLogs(Array.isArray(data.exerciseLogs) ? data.exerciseLogs : []);
        } else {
          setError("Δεν ήταν δυνατή η φόρτωση του μέλους.");
        }
      } catch {
        if (!cancelled) setError("Σφάλμα σύνδεσης με τον server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [memberId, endpoint]);

  const applyMemberPatch = async (updates: Record<string, unknown>, closeFormAfter = false) => {
    if (!member || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: member.id, updates }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.member) {
        setSaveError(data?.error || "Η ενημέρωση απέτυχε.");
        return;
      }

      setMember(data.member);
      syncFormFromMember(data.member);
      if (closeFormAfter) setEditing(false);
      setSaveMessage("Οι αλλαγές αποθηκεύτηκαν.");
      onUpdated?.();
    } catch {
      setSaveError("Σφάλμα σύνδεσης με τον server.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Record<string, unknown> = {
      fullName: formState.fullName,
      email: formState.email,
      tierName: formState.tierName,
      expiresAt: formState.expiresAt,
      subscriptionStatus: formState.subscriptionStatus,
      hasAIAccess: formState.hasAIAccess,
    };
    if (formState.pinCode.trim()) {
      updates.pinCode = formState.pinCode.trim();
    }
    await applyMemberPatch(updates, true);
  };

  const active = member?.subscription_status === "active";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Προφίλ μέλους"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface border border-border rounded-xl shadow-2xl p-5 sm:p-6 space-y-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Κλείσιμο"
          className="absolute top-4 right-4 p-1.5 rounded-sm text-secondary hover:text-primary hover:bg-surface-elevated transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {loading && (
          <div className="py-16 text-center text-xs text-secondary">Φόρτωση προφίλ...</div>
        )}

        {!loading && error && (
          <div className="py-16 text-center text-xs text-red-400">{error}</div>
        )}

        {!loading && member && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div>
                <div className="text-[10px] font-mono uppercase text-accent font-bold">
                  Προφίλ Μέλους
                </div>
                <h2 className="text-xl font-bold text-primary tracking-tight mt-0.5">
                  {member.full_name}
                </h2>
                <div className="text-xs text-secondary font-mono mt-0.5">{member.member_code}</div>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    syncFormFromMember(member);
                    setEditing((prev) => !prev);
                    setSaveError(null);
                    setSaveMessage(null);
                  }}
                  className="px-3 py-1.5 rounded-sm bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 text-accent" />
                  <span>{editing ? "Ακύρωση επεξεργασίας" : "Επεξεργασία"}</span>
                </button>
              )}
            </div>

            {canEdit && (
              <div className="p-3 rounded-lg bg-surface-elevated border border-border space-y-2.5">
                <div className="text-[10px] font-mono uppercase text-tertiary">
                  Γρήγορες Ενέργειες Συνδρομής
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {[1, 3, 12].map((months) => (
                    <button
                      key={months}
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void applyMemberPatch({
                          expiresAt: extendExpiryByMonths(member.expires_at, months),
                          subscriptionStatus: "active",
                        })
                      }
                      className="px-2.5 py-1 rounded-sm bg-background hover:bg-border disabled:opacity-50 text-primary font-mono font-semibold border border-border transition-colors"
                    >
                      +{months} {months === 1 ? "μήνας" : "μήνες"}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void applyMemberPatch({
                        subscriptionStatus: active ? "expired" : "active",
                      })
                    }
                    className="px-2.5 py-1 rounded-sm bg-background hover:bg-border disabled:opacity-50 text-primary font-semibold border border-border transition-colors"
                  >
                    {active ? "Σήμανση ως Ληγμένη" : "Ενεργοποίηση Συνδρομής"}
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void applyMemberPatch({
                        hasAIAccess: member.has_ai_access !== 1,
                      })
                    }
                    className="px-2.5 py-1 rounded-sm bg-background hover:bg-border disabled:opacity-50 text-accent font-semibold border border-border transition-colors"
                  >
                    {member.has_ai_access === 1 ? "Αφαίρεση AI" : "Ενεργοποίηση AI"}
                  </button>
                </div>

                {saveError && (
                  <div className="text-[11px] text-red-400">{saveError}</div>
                )}
                {saveMessage && (
                  <div className="text-[11px] text-emerald-400">{saveMessage}</div>
                )}
              </div>
            )}

            {canEdit && editing && (
              <form
                onSubmit={handleEditSubmit}
                className="p-4 rounded-xl bg-background border border-border space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-member-name" className="block text-[11px] text-secondary mb-1">
                      Ονοματεπώνυμο
                    </label>
                    <input
                      id="edit-member-name"
                      type="text"
                      required
                      value={formState.fullName}
                      onChange={(e) => setFormState({ ...formState, fullName: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-sm bg-surface border border-border text-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-member-email" className="block text-[11px] text-secondary mb-1">
                      Email
                    </label>
                    <input
                      id="edit-member-email"
                      type="email"
                      required
                      value={formState.email}
                      onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-sm bg-surface border border-border text-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-member-tier" className="block text-[11px] text-secondary mb-1">
                      Πακέτο
                    </label>
                    <input
                      id="edit-member-tier"
                      type="text"
                      required
                      value={formState.tierName}
                      onChange={(e) => setFormState({ ...formState, tierName: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-sm bg-surface border border-border text-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-member-expires" className="block text-[11px] text-secondary mb-1">
                      Λήξη Συνδρομής
                    </label>
                    <input
                      id="edit-member-expires"
                      type="date"
                      required
                      value={formState.expiresAt}
                      onChange={(e) => setFormState({ ...formState, expiresAt: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-sm bg-surface border border-border text-primary font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-member-status" className="block text-[11px] text-secondary mb-1">
                      Κατάσταση
                    </label>
                    <select
                      id="edit-member-status"
                      value={formState.subscriptionStatus}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          subscriptionStatus: e.target.value === "expired" ? "expired" : "active",
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-sm bg-surface border border-border text-primary"
                    >
                      <option value="active">Ενεργή</option>
                      <option value="expired">Έληξε</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-member-pin" className="block text-[11px] text-secondary mb-1">
                      Νέο PIN (4-6 ψηφία, προαιρετικό)
                    </label>
                    <input
                      id="edit-member-pin"
                      type="text"
                      maxLength={6}
                      placeholder="Κενό = χωρίς αλλαγή"
                      value={formState.pinCode}
                      onChange={(e) => setFormState({ ...formState, pinCode: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-sm bg-surface border border-border text-primary font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.hasAIAccess}
                      onChange={(e) =>
                        setFormState({ ...formState, hasAIAccess: e.target.checked })
                      }
                      className="rounded-sm border-border text-accent"
                    />
                    <span className="text-primary font-semibold">Πρόσβαση Ψηφιακού Βοηθού</span>
                  </label>

                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-sm bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-ink font-bold"
                  >
                    {saving ? "Αποθήκευση..." : "Αποθήκευση"}
                  </button>
                </div>
              </form>
            )}

            <div className="p-4 rounded-xl bg-background border border-border space-y-2">
              <Barcode value={member.member_code} height={64} />
              <div className="text-[10px] text-tertiary text-center">
                Σαρώστε το barcode στη ρεσεψιόν για αναγνώριση μέλους.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                <div className="text-[10px] uppercase text-tertiary">Email</div>
                <div className="text-primary mt-0.5 break-all">{member.email}</div>
              </div>
              <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                <div className="text-[10px] uppercase text-tertiary">Συνδρομή</div>
                <div className="text-primary mt-0.5">{member.tier_name}</div>
              </div>
              <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                <div className="text-[10px] uppercase text-tertiary">Κατάσταση</div>
                <div className={`mt-0.5 font-bold ${active ? "text-emerald-400" : "text-red-400"}`}>
                  {active ? "Ενεργή" : "Έληξε"}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                <div className="text-[10px] uppercase text-tertiary">Ψηφιακός Βοηθός</div>
                <div className="text-primary mt-0.5">
                  {member.has_ai_access === 1 ? "Ενεργός" : "Δεν περιλαμβάνεται"}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                <div className="text-[10px] uppercase text-tertiary">Λήξη</div>
                <div className="text-primary mt-0.5 font-mono">{formatDate(member.expires_at)}</div>
              </div>
              <div className="p-3 rounded-lg bg-surface-elevated border border-border">
                <div className="text-[10px] uppercase text-tertiary">Εγγραφή</div>
                <div className="text-primary mt-0.5 font-mono">{formatDate(member.created_at)}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-primary">
                  Ιστορικό Προγραμμάτων
                </h3>
                <span className="text-[10px] font-mono text-tertiary">
                  {plans.length} αποθηκευμένα
                </span>
              </div>

              {plans.length === 0 ? (
                <div className="p-4 rounded-lg bg-surface border border-border text-[11px] text-secondary">
                  Δεν υπάρχουν αποθηκευμένα προγράμματα.
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {plans.map((plan, index) => (
                    <div
                      key={plan.id ?? index}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="text-primary font-semibold">
                        {plan.splitName ?? "Πρόγραμμα"}
                      </div>
                      <div className="text-tertiary font-mono flex flex-wrap gap-x-3 gap-y-1">
                        <span>{plan.daysPerWeek ?? "—"} ημέρες/εβδ.</span>
                        <span>{plan.sessionDuration ?? "—"} λεπτά</span>
                        <span>{formatDate(plan.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-primary">Καταγραφές Κιλών</h3>
                <span className="text-[10px] font-mono text-tertiary">
                  {exerciseLogs.length} καταγραφές
                </span>
              </div>

              {exerciseLogs.length === 0 ? (
                <div className="p-4 rounded-lg bg-surface border border-border text-[11px] text-secondary">
                  Δεν υπάρχουν συγχρονισμένες καταγραφές βάρους.
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {exerciseLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="p-3 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-primary font-mono truncate">{log.exercise_name}</span>
                      <span className="text-tertiary font-mono shrink-0">
                        <strong className="text-accent">{log.weight_kg} kg</strong> × {log.reps} •{" "}
                        {formatDate(log.logged_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-primary">Πρόσφατες Παρουσίες</h3>
                <span className="text-[10px] font-mono text-tertiary">
                  {visits.length} καταγραφές
                </span>
              </div>

              {visits.length === 0 ? (
                <div className="p-4 rounded-lg bg-surface border border-border text-[11px] text-secondary">
                  Δεν υπάρχουν καταγραφές παρουσίας.
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {visits.map((visit) => (
                    <div
                      key={visit.id}
                      className="p-3 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-primary font-mono">
                        {formatDate(visit.checked_in_at)}
                      </span>
                      <span className="text-tertiary font-mono">
                        {formatTime(visit.checked_in_at)} →{" "}
                        {visit.checked_out_at ? formatTime(visit.checked_out_at) : "μέσα"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
