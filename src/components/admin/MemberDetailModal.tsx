"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
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

interface MemberDetailModalProps {
  memberId: string;
  onClose: () => void;
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("el-GR");
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({ memberId, onClose }) => {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(true, onClose);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/admin/members?id=${encodeURIComponent(memberId)}`);
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.success && data.member) {
          setMember(data.member);
          setPlans(Array.isArray(data.plans) ? data.plans : []);
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
  }, [memberId]);

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
          className="absolute top-4 right-4 p-1.5 rounded text-secondary hover:text-primary hover:bg-surface-elevated transition-colors"
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
            <div>
              <div className="text-[10px] font-mono uppercase text-accent font-bold">
                Προφίλ Μέλους
              </div>
              <h2 className="text-xl font-bold text-primary tracking-tight mt-0.5">
                {member.full_name}
              </h2>
              <div className="text-xs text-secondary font-mono mt-0.5">{member.member_code}</div>
            </div>

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

              <p className="text-[10px] text-tertiary">
                Οι καταγραφές βάρους αποθηκεύονται τοπικά στη συσκευή του μέλους και δεν
                εμφανίζονται εδώ.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
