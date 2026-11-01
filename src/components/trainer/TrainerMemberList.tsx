"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { MemberDetailModal } from "@/components/admin/MemberDetailModal";

interface MemberItem {
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

export const TrainerMemberList: React.FC = () => {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/trainer/members", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.members)) setMembers(data.members);
        else setError("Δεν ήταν δυνατή η φόρτωση των μελών.");
      })
      .catch(() => {
        if (!cancelled) setError("Σφάλμα σύνδεσης με τον server.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      [member.full_name, member.member_code, member.email, member.tier_name].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [members, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-primary">Μέλη</h2>
          <p className="text-[11px] text-tertiary">
            Αναζήτηση με όνομα, κωδικό ή email. Πατήστε ένα μέλος για το προφίλ του.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-tertiary absolute left-3 top-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση μέλους..."
            aria-label="Αναζήτηση μέλους"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-background border border-border text-primary text-xs outline-none focus:border-border-light"
          />
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-xs text-secondary">Φόρτωση μελών...</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
          Δεν βρέθηκαν μέλη.
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
          {filtered.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => setSelectedMemberId(member.id)}
              className="w-full p-4 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-surface-elevated/50 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-accent text-sm">
                    {member.member_code}
                  </span>
                  <span className="font-bold text-primary">{member.full_name}</span>
                </div>
                <div className="text-secondary truncate mt-0.5">
                  {member.email} • Λήξη:{" "}
                  <strong className="text-primary font-mono">{member.expires_at}</strong>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                    member.has_ai_access === 1
                      ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                      : "bg-surface-elevated text-secondary border-border"
                  }`}
                >
                  {member.has_ai_access === 1 ? "Ψηφιακός Βοηθός" : "Βασικό Πακέτο"}
                </span>
                <span className="text-[10px] text-accent">Προφίλ →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedMemberId && (
        <MemberDetailModal
          memberId={selectedMemberId}
          endpoint="/api/trainer/members"
          onClose={() => setSelectedMemberId(null)}
        />
      )}
    </div>
  );
};
