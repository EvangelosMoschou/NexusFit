"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { useGymConfig } from "@/lib/useGymConfig";
import { exercisesDatabase } from "@/data/exercisesData";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { equipmentLabel, muscleGroupLabel } from "@/lib/format";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise: (exId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectExercise }) => {
  const { config } = useGymConfig();
  const [query, setQuery] = useState("");

  // Ctrl/Cmd+K toggles the command palette.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Escape dismissal is shared across every overlay.
  useEscapeKey(isOpen, onClose);

  // Focus the field when the palette opens. Done via a ref instead of the
  // `autoFocus` prop, which is discouraged for accessibility.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredExercises = exercisesDatabase.filter(
    (ex) =>
      ex.name.toLowerCase().includes(query.toLowerCase()) ||
      ex.greekName.toLowerCase().includes(query.toLowerCase()) ||
      ex.muscleGroup.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);

  const filteredClasses = config.schedule.filter(
    (sch) =>
      sch.className.toLowerCase().includes(query.toLowerCase()) ||
      sch.category.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 3);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Αναζήτηση ασκήσεων και μαθημάτων"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-black/80"
    >
      <div className="w-full max-w-xl bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in-50 duration-150">
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-border bg-background">
          <Search className="w-4 h-4 text-secondary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            aria-label="Αναζήτηση"
            placeholder="Αναζήτηση ασκήσεων, ομαδικών μαθημάτων ή εγκαταστάσεων..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-primary text-xs outline-none placeholder:text-tertiary"
          />
          <button
            onClick={onClose}
            className="text-[11px] font-mono text-tertiary px-1.5 py-0.5 rounded border border-border hover:text-primary"
          >
            ESC
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
          {/* Exercises */}
          <div>
            <div className="text-[10px] font-mono uppercase text-tertiary px-2 mb-1.5">
              Ασκησιολόγιο ({filteredExercises.length})
            </div>
            {filteredExercises.length > 0 ? (
              <div className="space-y-1">
                {filteredExercises.map((ex) => (
                  <div
                    key={ex.id}
                    onClick={() => {
                      onSelectExercise(ex.id);
                      onClose();
                    }}
                    className="p-2.5 rounded hover:bg-surface-elevated cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-primary">{ex.greekName}</div>
                      <div className="text-[11px] text-tertiary">{muscleGroupLabel(ex.muscleGroup)}</div>
                    </div>
                    <span className="text-[10px] font-mono text-accent uppercase">
                      {equipmentLabel(ex.equipment)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2 text-xs text-tertiary">Δεν βρέθηκαν ασκήσεις.</div>
            )}
          </div>

          {/* Classes */}
          {filteredClasses.length > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="text-[10px] font-mono uppercase text-tertiary px-2 mb-1.5">
                Ομαδικά Μαθήματα
              </div>
              <div className="space-y-1">
                {filteredClasses.map((cl) => (
                  <div
                    key={cl.id}
                    className="p-2.5 rounded hover:bg-surface-elevated flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-primary">{cl.className}</div>
                      <div className="text-[11px] text-tertiary">{cl.dayGreek} • {cl.time}</div>
                    </div>
                    <span className="text-[10px] font-mono text-secondary">
                      {cl.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
