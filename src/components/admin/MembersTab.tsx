"use client";

import React, { useState } from "react";
import { Plus, Trash2, Bot, Lock, Search } from "lucide-react";
import { postJson } from "@/lib/apiClient";
import { MemberDetailModal } from "@/components/admin/MemberDetailModal";

export interface MemberItem {
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

interface MembersTabProps {
  members: MemberItem[];
  onRefresh: () => void;
  onDelete: (id: string) => void;
}

const emptyMemberForm = () => ({
  memberCode: "",
  fullName: "",
  email: "",
  pinCode: "1234",
  tierName: "Πλήρες Μέλος",
  hasAIAccess: true,
  subscriptionStatus: "active",
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
});

// TAB 2: MEMBERS & AI PASSES
export const MembersTab: React.FC<MembersTabProps> = ({ members, onRefresh, onDelete }) => {
  const [newMember, setNewMember] = useState(emptyMemberForm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const filteredMembers = needle
    ? members.filter((member) =>
        [member.full_name, member.member_code, member.email, member.tier_name].some((value) =>
          value.toLowerCase().includes(needle)
        )
      )
    : members;

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.memberCode || !newMember.fullName || !newMember.email) return;

    setIsSaving(true);
    setSaveError(null);

    const result = await postJson("/api/admin/members", { member: newMember });

    setIsSaving(false);
    if (result.ok) {
      onRefresh();
      setNewMember(emptyMemberForm());
    } else {
      // Previously a failed save was swallowed and looked like nothing happened.
      setSaveError(
        "Η αποθήκευση απέτυχε. Ελέγξτε ότι το barcode/email είναι μοναδικά και το PIN έχει 4-6 ψηφία."
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-primary">Διαχείριση Καρτών Μελών & Ψηφιακού Βοηθού</h2>
        <p className="text-xs text-secondary">Καταχώρηση νέων μελών και ενεργοποίηση της πρόσβασης στον ψηφιακό προπονητή (+14€).</p>
      </div>

      {/* Quick Add Member Form */}
      <form onSubmit={handleCreateMember} className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="text-xs font-bold text-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-accent" />
          <span>Έκδοση Νέας Κάρτας Μέλους</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-secondary mb-1">Κωδικός Κάρτας</label>
            <input
              type="text"
              required
              placeholder="π.χ. NX-9921"
              value={newMember.memberCode}
              onChange={(e) => setNewMember({ ...newMember, memberCode: e.target.value })}
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-secondary mb-1">Ονοματεπώνυμο</label>
            <input
              type="text"
              required
              placeholder="π.χ. Κωνσταντίνος Νικολάου"
              value={newMember.fullName}
              onChange={(e) => setNewMember({ ...newMember, fullName: e.target.value })}
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-secondary mb-1">Ηλεκτρονικό Ταχυδρομείο</label>
            <input
              type="email"
              required
              placeholder="member@example.com"
              value={newMember.email}
              onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-secondary mb-1">PIN Σύνδεσης (4 ψηφία)</label>
            <input
              type="text"
              required
              maxLength={6}
              value={newMember.pinCode}
              onChange={(e) => setNewMember({ ...newMember, pinCode: e.target.value })}
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs outline-none font-mono tracking-widest"
            />
          </div>
        </div>

        {saveError && (
          <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
            {saveError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={newMember.hasAIAccess}
              onChange={(e) => setNewMember({ ...newMember, hasAIAccess: e.target.checked })}
              className="rounded border-border text-accent focus:ring-0"
            />
            <span className="font-semibold text-primary">Ενεργοποίηση Ψηφιακού Βοηθού (+14€/μήνα)</span>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-ink font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isSaving ? "Αποθήκευση..." : "Αποθήκευση & Έκδοση Μέλους"}</span>
          </button>
        </div>
      </form>

      {/* Existing Members Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-primary">Μέλη ({filteredMembers.length})</h3>
            <p className="text-[11px] text-tertiary">
              Αναζήτηση με όνομα, κωδικό κάρτας ή email. Πατήστε ένα μέλος για πλήρες προφίλ.
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

        <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
          {filteredMembers.length === 0 ? (
            <div className="p-6 text-center text-xs text-secondary">
              Δεν βρέθηκαν μέλη για αυτή την αναζήτηση.
            </div>
          ) : (
            filteredMembers.map((m) => (
              <div
                key={m.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs hover:bg-surface-elevated/50 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setSelectedMemberId(m.id)}
                  className="flex-1 min-w-0 text-left space-y-1"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-accent text-sm">{m.member_code}</span>
                    <span className="font-bold text-primary">{m.full_name}</span>
                  </div>
                  <div className="text-secondary truncate">
                    {m.email} • Λήξη: <strong className="text-primary font-mono">{m.expires_at}</strong>
                  </div>
                  <div className="text-[10px] text-accent">Προβολή προφίλ & barcode →</div>
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  <div className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold flex items-center gap-1.5 ${
                    m.has_ai_access === 1
                      ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
                      : "bg-surface-elevated text-secondary border border-border"
                  }`}>
                    {m.has_ai_access === 1 ? <Bot className="w-3.5 h-3.5 text-accent" /> : <Lock className="w-3 h-3" />}
                    <span>{m.has_ai_access === 1 ? "Ψηφιακός Βοηθός" : "Βασικό Πακέτο"}</span>
                  </div>

                  <button
                    onClick={() => onDelete(m.id)}
                    aria-label="Διαγραφή Μέλους"
                    className="p-1.5 rounded text-secondary hover:text-red-400 transition-colors"
                    title="Διαγραφή Μέλους"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedMemberId && (
        <MemberDetailModal
          memberId={selectedMemberId}
          onClose={() => setSelectedMemberId(null)}
        />
      )}
    </div>
  );
};
