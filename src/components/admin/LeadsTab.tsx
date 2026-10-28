"use client";

import React from "react";
import { RefreshCw, Trash2 } from "lucide-react";

export interface LeadItem {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  goal: string | null;
  preferred_plan: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

interface LeadsTabProps {
  leads: LeadItem[];
  onRefresh: () => void;
  onUpdateStatus: (id: string, status: "pending" | "contacted" | "registered") => void;
  onDelete: (id: string) => void;
}

// TAB 1: LEADS & INQUIRIES
export const LeadsTab: React.FC<LeadsTabProps> = ({ leads, onRefresh, onUpdateStatus, onDelete }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Αιτήματα Επικοινωνίας & Δοκιμαστικών</h2>
          <p className="text-xs text-secondary">Υποψήφιοι πελάτες που συμπλήρωσαν τη φόρμα ενδιαφέροντος στην ιστοσελίδα.</p>
        </div>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 rounded-lg bg-surface border border-border text-secondary hover:text-white text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Ανανέωση</span>
        </button>
      </div>

      {leads.length > 0 ? (
        <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
          {leads.map((lead) => (
            <div key={lead.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{lead.full_name}</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    lead.status === "pending"
                      ? "bg-amber-950/60 text-amber-400 border-amber-800"
                      : lead.status === "contacted"
                      ? "bg-blue-950/60 text-blue-400 border-blue-800"
                      : "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                  }`}>
                    {lead.status === "pending" ? "Εκκρεμεί" : lead.status === "contacted" ? "Έγινε Επαφή" : "Εγγράφηκε"}
                  </span>
                </div>
                <div className="text-secondary flex items-center gap-3">
                  <span>Ηλεκτρονικό Ταχυδρομείο: <strong className="text-white">{lead.email}</strong></span>
                  {lead.phone && <span>Τηλ: <strong className="text-white">{lead.phone}</strong></span>}
                </div>
                {lead.preferred_plan && (
                  <div className="text-accent text-[11px]">Ενδιαφέρον για: {lead.preferred_plan}</div>
                )}
                {lead.notes && (
                  <div className="text-tertiary bg-background p-2 rounded text-[11px] mt-1 max-w-xl">
                    &quot;{lead.notes}&quot;
                  </div>
                )}
                <div className="text-[10px] text-tertiary font-mono pt-1">
                  Ημερομηνία: {new Date(lead.created_at).toLocaleString("el-GR")}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {lead.status !== "contacted" && (
                  <button
                    onClick={() => onUpdateStatus(lead.id, "contacted")}
                    className="px-2.5 py-1.5 rounded bg-surface-elevated hover:bg-border text-white text-[11px] font-semibold border border-border"
                  >
                    Σημείωση: Επικοινωνήσαμε
                  </button>
                )}
                {lead.status !== "registered" && (
                  <button
                    onClick={() => onUpdateStatus(lead.id, "registered")}
                    className="px-2.5 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 text-[11px] font-semibold border border-emerald-800"
                  >
                    Εγγραφή στο Γυμναστήριο
                  </button>
                )}
                <button
                  onClick={() => onDelete(lead.id)}
                  aria-label="Διαγραφή αιτήματος"
                  title="Διαγραφή αιτήματος"
                  className="p-1.5 rounded bg-surface-elevated hover:bg-red-950/60 text-secondary hover:text-red-300 border border-border transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center bg-surface rounded-xl border border-border text-xs text-secondary">
          Δεν υπάρχουν ακόμη νέα αιτήματα επικοινωνίας.
        </div>
      )}
    </div>
  );
};
