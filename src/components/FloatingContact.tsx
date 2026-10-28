"use client";

import React, { useState } from "react";
import { MessageSquare, X, Send, Check } from "lucide-react";

export const FloatingContact: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg || !senderEmail) return;
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setOpen(false);
      setMsg("");
      setSenderEmail("");
    }, 2000);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 left-6 z-40 p-3 rounded-full bg-surface border border-border text-white hover:bg-surface-elevated transition-colors shadow-xl flex items-center gap-2 text-xs font-semibold"
        aria-label="Γρήγορη επικοινωνία"
      >
        <MessageSquare className="w-4 h-4 text-accent" />
        <span className="hidden sm:inline">Ερώτηση</span>
      </button>

      {/* Floating Modal / Popover */}
      {open && (
        <div className="fixed bottom-20 left-6 z-50 w-[320px] sm:w-[360px] bg-surface border border-border rounded-lg shadow-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <div className="text-xs font-bold text-white">Άμεση Επικοινωνία</div>
              <div className="text-[11px] text-secondary">Απαντάμε εντός 24 ωρών</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Κλείσιμο φόρμας"
              className="p-1 rounded text-secondary hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {sent ? (
            <div className="py-6 text-center space-y-2 text-xs text-white">
              <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center mx-auto">
                <Check className="w-4 h-4" />
              </div>
              <div className="font-bold">Το μήνυμά σας στάλθηκε</div>
              <div className="text-secondary text-[11px]">Θα λάβετε απάντηση στο {senderEmail}</div>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-secondary mb-1">
                  Ηλεκτρονικό Ταχυδρομείο
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-background border border-border text-white text-xs outline-none focus:border-border-light"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-secondary mb-1">
                  Μήνυμα / Ερώτηση
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Γράψτε την απορία σας..."
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-background border border-border text-white text-xs outline-none focus:border-border-light resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded bg-white hover:bg-white/90 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Αποστολή Μηνύματος</span>
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
};
