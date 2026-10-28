"use client";

import React from "react";
import { X } from "lucide-react";
import { useGymConfig } from "@/lib/useGymConfig";
import { useEscapeKey } from "@/lib/useEscapeKey";

interface LegalModalProps {
  type: "tos" | "privacy" | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
  const { config } = useGymConfig();

  useEscapeKey(Boolean(type), onClose);

  if (!type) return null;

  // Legal text is per-gym and admin-editable, so it lives in the gym config
  // instead of being hardcoded here.
  const sections = config.legal?.[type] ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={type === "tos" ? "Όροι χρήσης" : "Πολιτική απορρήτου"}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="relative w-full max-w-2xl bg-surface border border-border p-6 sm:p-8 rounded-lg shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
          <h3 className="text-lg font-bold text-primary">
            {type === "tos" ? "Όροι Χρήσης & Λειτουργίας" : "Πολιτική Απορρήτου (GDPR)"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Κλείσιμο"
            className="p-1.5 rounded text-secondary hover:text-primary hover:bg-surface-elevated transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-sm text-secondary space-y-4 leading-relaxed">
          {sections.map((section) => (
            <p key={section.title}>
              <strong>{section.title}:</strong> {section.body}
            </p>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-elevated hover:bg-border text-primary text-xs font-semibold rounded transition-colors"
          >
            Κλείσιμο
          </button>
        </div>
      </div>
    </div>
  );
};
