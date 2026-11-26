"use client";

import React, { useState } from "react";
import { X, Send, Bot, User } from "lucide-react";
import { ChatMessage, processAgentQuery } from "@/lib/aiAgentChat";
import { memberFetch } from "@/lib/memberFetch";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useGymConfig } from "@/lib/useGymConfig";
import { equipmentLabel, muscleGroupLabel } from "@/lib/format";

interface AICoachChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function nowTimestamp(): string {
  return new Date().toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function makeMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export const AICoachChatModal: React.FC<AICoachChatModalProps> = ({ isOpen, onClose }) => {
  const { config } = useGymConfig();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "init-1",
      sender: "agent",
      text: `Γεια σας! Είμαι ο ψηφιακός προπονητής του ${config.gymName}. Έχω πρόσβαση στη βάση δεδομένων του γυμναστηρίου για όλες τις ασκήσεις, τα μηχανήματα και την ασφάλεια τραυματισμών. Πώς μπορώ να σας βοηθήσω στη σημερινή σας προπόνηση;`,
      timestamp: nowTimestamp(),
    },
  ]);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const send = async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || loading) return;

    const history = messages
      .filter((msg) => msg.id !== "init-1")
      .slice(-6)
      .map((msg) => ({
        role: msg.sender === "user" ? ("user" as const) : ("model" as const),
        text: msg.text,
      }));

    const userMsg: ChatMessage = {
      id: makeMessageId("user"),
      sender: "user",
      text: query,
      timestamp: nowTimestamp(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!text) setInput("");
    setLoading(true);

    try {
      const res = await memberFetch("/api/ai-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, history }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success && typeof data.text === "string") {
        const reply: ChatMessage = {
          id: typeof data.id === "string" ? data.id : makeMessageId("agent"),
          sender: "agent",
          text: data.text,
          timestamp: typeof data.timestamp === "string" ? data.timestamp : nowTimestamp(),
          matchedExercises: Array.isArray(data.matchedExercises)
            ? data.matchedExercises
            : undefined,
        };
        setMessages((prev) => [...prev, reply]);
        return;
      }

      if (res.status === 403 || res.status === 429 || res.status === 400) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeMessageId("agent-err"),
            sender: "agent",
            text:
              typeof data?.error === "string"
                ? data.error
                : "Δεν ήταν δυνατή η απάντηση αυτή τη στιγμή.",
            timestamp: nowTimestamp(),
          },
        ]);
        return;
      }

      if (res.status === 401) {
        return;
      }

      // Fallback to local deterministic engine on server 5xx
      setMessages((prev) => [...prev, processAgentQuery(query)]);
    } catch {
      // Offline / network error fallback
      setMessages((prev) => [...prev, processAgentQuery(query)]);
    } finally {
      setLoading(false);
    }
  };

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
            <div className="w-8 h-8 rounded-lg bg-accent text-accent-ink flex items-center justify-center font-bold">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-primary">Ψηφιακός Βοηθός {config.gymName}</h3>
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
            className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-surface-elevated transition-colors border border-border"
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
              className="px-2.5 py-1 rounded-md bg-surface-elevated hover:bg-border text-secondary hover:text-primary text-[11px] font-medium whitespace-nowrap transition-colors border border-border"
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
                <div className="w-6 h-6 rounded-sm bg-surface-elevated text-accent flex items-center justify-center shrink-0 mt-0.5 border border-border">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[82%] p-3.5 rounded-xl space-y-2 ${
                  msg.sender === "user"
                    ? "bg-btn text-btn-ink font-medium rounded-tr-none shadow-xs"
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
                          className="p-2 rounded-sm bg-surface-elevated/70 border border-border/80 flex items-center justify-between text-[11px]"
                        >
                          <div>
                            <div className="font-semibold text-primary">{ex.greekName}</div>
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
                    msg.sender === "user" ? "text-tertiary" : "text-tertiary"
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === "user" && (
                <div className="w-6 h-6 rounded-sm bg-accent text-accent-ink flex items-center justify-center shrink-0 mt-0.5">
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
            className="flex-1 px-3.5 py-2 rounded-lg bg-background border border-border text-primary text-xs outline-hidden focus:border-border-light placeholder:text-tertiary"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-lg bg-btn hover:bg-btn-hover disabled:opacity-50 text-btn-ink font-bold transition-colors shadow-xs"
            aria-label="Αποστολή"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
