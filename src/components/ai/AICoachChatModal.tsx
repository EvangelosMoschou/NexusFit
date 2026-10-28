"use client";

import React from "react";
import { X, Send, Bot, User } from "lucide-react";
import { useLocalAgentChat } from "@/lib/useLocalAgentChat";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { equipmentLabel, muscleGroupLabel } from "@/lib/format";

interface AICoachChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AICoachChatModal: React.FC<AICoachChatModalProps> = ({ isOpen, onClose }) => {
  const { input, setInput, messages, loading, send } = useLocalAgentChat(
    "Γεια σας! Είμαι ο ψηφιακός προπονητής του NexusFit. Έχω πρόσβαση στη βάση δεδομένων του γυμναστηρίου για όλες τις ασκήσεις, τα μηχανήματα και την ασφάλεια τραυματισμών. Πώς μπορώ να σας βοηθήσω στη σημερινή σας προπόνηση;"
  );

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const quickPrompts = [
    "Εναλλακτική για Πιέσεις Πάγκου",
    "Ευαισθησία στη μέση",
    "Ενόχληση στον ώμο",
    "Σετ & Επαναλήψεις για Υπερτροφία",
    "Πόση πρωτεΐνη χρειάζομαι;",
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Συνομιλία με τον ψηφιακό προπονητή"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="relative w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl flex flex-col h-[600px] max-h-[90vh] overflow-hidden">
        
        {/* Header (No Overlap) */}
        <div className="p-4 bg-background border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent text-black flex items-center justify-center font-bold">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Ψηφιακός Βοηθός NexusFit</h3>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-mono">Συνδεδεμένη βάση ασκήσεων</span>
              </div>
              <p className="text-[11px] text-secondary">
                Άμεσες απαντήσεις για ασκήσεις, εναλλακτικές και ασφάλεια
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Κλείσιμο"
            className="p-1.5 rounded-lg text-secondary hover:text-white hover:bg-surface-elevated transition-colors border border-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="p-2.5 bg-surface/50 border-b border-border flex items-center gap-1.5 overflow-x-auto">
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => send(prompt)}
              className="px-2.5 py-1 rounded-md bg-surface-elevated hover:bg-border text-secondary hover:text-white text-[11px] font-medium whitespace-nowrap transition-colors border border-border"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-background/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs leading-relaxed ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.sender === "agent" && (
                <div className="w-6 h-6 rounded bg-surface-elevated text-accent flex items-center justify-center shrink-0 mt-0.5 border border-border">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[82%] p-3.5 rounded-xl space-y-2 ${
                  msg.sender === "user"
                    ? "bg-white text-black font-medium rounded-tr-none shadow-sm"
                    : "bg-surface border border-border text-primary rounded-tl-none"
                }`}
              >
                <div>{msg.text}</div>

                {/* Matched exercises preview if retrieved from DB */}
                {msg.matchedExercises && msg.matchedExercises.length > 0 && (
                  <div className="pt-2 border-t border-border/60 space-y-1.5">
                    <div className="text-[10px] font-mono uppercase text-accent font-bold">
                      Προτεινόμενες Ασκήσεις από τη Βάση:
                    </div>
                    <div className="space-y-1">
                      {msg.matchedExercises.map((ex) => (
                        <div
                          key={ex.id}
                          className="p-2 rounded bg-surface-elevated/70 border border-border/80 flex items-center justify-between text-[11px]"
                        >
                          <div>
                            <div className="font-semibold text-white">{ex.greekName}</div>
                            <div className="text-[10px] text-tertiary">{muscleGroupLabel(ex.muscleGroup)}</div>
                          </div>
                          <span className="font-mono text-[10px] text-accent uppercase">
                            {equipmentLabel(ex.equipment)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={`text-[9px] font-mono ${
                    msg.sender === "user" ? "text-neutral-500" : "text-tertiary"
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === "user" && (
                <div className="w-6 h-6 rounded bg-accent text-black flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 items-center text-xs text-secondary p-2">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span>Ο βοηθός αναζητά στη βάση δεδομένων...</span>
            </div>
          )}
        </div>

        {/* Input area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="p-3 bg-surface border-t border-border flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Ρωτήστε τον ψηφιακό προπονητή (π.χ. 'Πονάει ο ώμος μου, τι να κάνω;')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 px-3.5 py-2 rounded-lg bg-background border border-border text-white text-xs outline-none focus:border-border-light placeholder:text-tertiary"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-lg bg-white hover:bg-white/90 disabled:opacity-50 text-black font-bold transition-colors shadow-sm"
            aria-label="Αποστολή"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
