"use client";

import React, { useState } from "react";
import { X, Lock, User, AlertCircle } from "lucide-react";
import { MemberUser } from "@/lib/auth";
import { useEscapeKey } from "@/lib/useEscapeKey";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (member: MemberUser) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const handleLogin = async (e?: React.FormEvent, customId?: string, customPin?: string) => {
    if (e) e.preventDefault();
    const idToUse = customId || identifier;
    const pinToUse = customPin || pin;

    if (!idToUse || !pinToUse) {
      setError("Συμπληρώστε τον Κωδικό Μέλους και το PIN.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Try Local SQLite Server Endpoint
      const res = await fetch("/api/auth/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: idToUse, pin: pinToUse }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.member) {
        onSuccess(data.member);
        onClose();
        return;
      } else if (res.status === 401) {
        setError(data.error || "Λανθασμένος κωδικός μέλους ή PIN.");
        return;
      }
    } catch {
      setError("Αποτυχία σύνδεσης.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (code: string) => {
    setIdentifier(code);
    setPin("1234");
    handleLogin(undefined, code, "1234");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Σύνδεση μέλους"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="relative w-full max-w-md bg-surface border border-border p-6 sm:p-8 rounded-lg shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Κλείσιμο"
          className="absolute top-5 right-5 p-1.5 rounded text-secondary hover:text-primary hover:bg-surface-elevated transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <div className="text-[10px] font-mono uppercase text-accent font-bold">
            Πρόσβαση Μελών
          </div>
          <h2 className="text-xl font-bold text-primary tracking-tight mt-0.5">
            Σύνδεση Μέλους Γυμναστηρίου
          </h2>
          <p className="text-xs text-secondary mt-1">
            Εισάγετε τον κωδικό μέλους της κάρτας σας για πρόσβαση στον ψηφιακό βοηθό.
          </p>
        </div>

        {/* Quick Demo Test Buttons */}
        <div className="p-3 rounded bg-background border border-border space-y-2">
          <div className="text-[10px] font-mono text-tertiary uppercase">
            Γρήγορη Δοκιμή (Δοκιμαστικά Στοιχεία):
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickDemo("NX-8492")}
              className="py-1.5 px-2.5 rounded bg-surface-elevated hover:bg-border text-left text-xs text-primary border border-border flex items-center justify-between transition-colors"
            >
              <span>Γ. Παπαδόπουλος (NX-8492)</span>
              <span className="text-[10px] font-mono text-accent">Ενεργή Πρόσβαση</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo("NX-3109")}
              className="py-1.5 px-2.5 rounded bg-surface-elevated hover:bg-border text-left text-xs text-secondary border border-border flex items-center justify-between transition-colors"
            >
              <span>Μ. Κωνσταντίνου (NX-3109)</span>
              <span className="text-[10px] font-mono text-tertiary">Βασική Πρόσβαση</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <label
              htmlFor="login-identifier"
              className="block text-[11px] font-semibold text-secondary mb-1"
            >
              Κωδικός Μέλους ή Ηλεκτρονικό Ταχυδρομείο
            </label>
            <div className="relative">
              <input
                id="login-identifier"
                type="text"
                required
                placeholder="π.χ. NX-8492 ή ηλεκτρονικό ταχυδρομείο"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded bg-background border border-border text-primary text-xs outline-none focus:border-border-light font-mono"
              />
              <User className="w-3.5 h-3.5 text-secondary absolute left-2.5 top-3" />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-pin"
              className="block text-[11px] font-semibold text-secondary mb-1"
            >
              PIN Ασφαλείας (4 ψηφία)
            </label>
            <div className="relative">
              <input
                id="login-pin"
                type="password"
                required
                maxLength={6}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded bg-background border border-border text-primary text-xs outline-none focus:border-border-light font-mono tracking-widest"
              />
              <Lock className="w-3.5 h-3.5 text-secondary absolute left-2.5 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs tracking-tight transition-colors text-center mt-2"
          >
            {loading ? "Έλεγχος συνδρομής..." : "Σύνδεση στο Dashboard"}
          </button>
        </form>

        <div className="text-center pt-2 text-[11px] text-tertiary">
          Δεν έχετε PIN ή χάσατε την κάρτα σας; Απευθυνθείτε στη γραμματεία του γυμναστηρίου.
        </div>
      </div>
    </div>
  );
};
