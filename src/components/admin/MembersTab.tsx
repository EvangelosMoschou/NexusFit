"use client";

import React, { useState } from "react";
import { Plus, Trash2, Bot, Lock } from "lucide-react";
import { postJson } from "@/lib/apiClient";

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
        <h2 className="text-base font-bold text-white">Διαχείριση Καρτών Μελών & Ψηφιακού Βοηθού</h2>
        <p className="text-xs text-secondary">Καταχώρηση νέων μελών και ενεργοποίηση της πρόσβασης στον ψηφιακό προπονητή (+14€).</p>
      </div>

      {/* Quick Add Member Form */}
      <form onSubmit={handleCreateMember} className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="text-xs font-bold text-white flex items-center gap-1.5">
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
              className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs outline-none font-mono"
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
              className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs outline-none"
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
              className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs outline-none"
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
              className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs outline-none font-mono tracking-widest"
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
            <span className="font-semibold text-white">Ενεργοποίηση Ψηφιακού Βοηθού (+14€/μήνα)</span>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-50 text-black font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isSaving ? "Αποθήκευση..." : "Αποθήκευση & Έκδοση Μέλους"}</span>
          </button>
        </div>
      </form>

      {/* Existing Members Table */}
      <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
        {members.map((m) => (
          <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-accent text-sm">{m.member_code}</span>
                <span className="font-bold text-white">{m.full_name}</span>
              </div>
              <div className="text-secondary">
                {m.email} • Λήξη: <strong className="text-white font-mono">{m.expires_at}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3">
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
        ))}
      </div>
    </div>
  );
};
