"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Lock, LogIn, LogOut, Users } from "lucide-react";

interface Occupancy {
  inside: number;
  capacity: number;
}

export const CheckInKiosk: React.FC = () => {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  const submit = async (action: "in" | "out") => {
    if (!identifier.trim() || !pin.trim()) {
      setMessage({ text: "Συμπληρώστε κωδικό μέλους και PIN.", kind: "error" });
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, pin, action }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Η καταγραφή απέτυχε.");
      }

      const verb =
        data.status === "in"
          ? "καταγράφηκε η είσοδος"
          : data.status === "already_in"
            ? "ήταν ήδη μέσα"
            : data.status === "not_in"
              ? "δεν ήταν μέσα"
              : "καταγράφηκε η έξοδος";

      setMessage({
        text: `${data.memberName} (${data.memberCode}) — ${verb}.`,
        kind: "ok",
      });
      setIdentifier("");
      setPin("");
      setOccupancy(data.occupancy ?? null);
      codeRef.current?.focus();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Η καταγραφή απέτυχε.",
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-xs text-secondary hover:text-primary">
            <ArrowLeft className="w-3.5 h-3.5" />
            Επιστροφή στο site
          </Link>
          <span className="text-[10px] font-mono uppercase text-accent font-bold">
            Καταγραφή παρουσίας
          </span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xl">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-primary tracking-tight">Καλώς ήρθες</h1>
            {occupancy ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-elevated border border-border text-xs font-semibold text-secondary">
                <Users className="w-3.5 h-3.5 text-accent" />
                <span>
                  Μέσα τώρα: <strong className="text-primary">{occupancy.inside}</strong>
                  {occupancy.capacity > 0 ? ` / ${occupancy.capacity}` : ""}
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-elevated border border-border text-xs font-semibold text-secondary">
                <Lock className="w-3.5 h-3.5 text-accent" />
                <span>Η πληρότητα είναι για Premium μέλη</span>
              </div>
            )}
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit("in");
            }}
          >
            <div>
              <label htmlFor="kiosk-code" className="block text-[11px] font-semibold text-secondary mb-1">
                Κωδικός μέλους
              </label>
              <input
                id="kiosk-code"
                ref={codeRef}
                autoComplete="off"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="π.χ. NX-8492"
                className="w-full px-4 py-3 rounded-lg bg-background border border-border text-primary text-base font-mono outline-none focus:border-border-light"
              />
            </div>

            <div>
              <label htmlFor="kiosk-pin" className="block text-[11px] font-semibold text-secondary mb-1">
                PIN
              </label>
              <input
                id="kiosk-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="w-full px-4 py-3 rounded-lg bg-background border border-border text-primary text-base font-mono tracking-widest outline-none focus:border-border-light"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="py-3 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-ink font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Είσοδος
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit("out")}
                className="py-3 rounded-lg bg-surface-elevated hover:bg-border disabled:opacity-50 text-primary font-bold text-sm border border-border flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Έξοδος
              </button>
            </div>
          </form>

          {message && (
            <div
              role="status"
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                message.kind === "ok"
                  ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                  : "bg-red-950/40 border-red-800/60 text-red-300"
              }`}
            >
              {message.kind === "ok" && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{message.text}</span>
            </div>
          )}

          <p className="text-[10px] text-tertiary text-center leading-relaxed">
            Πληκτρολογήστε ή σκανάρετε τον κωδικό σας, βάλτε το PIN και πατήστε
            «Είσοδος» όταν μπαίνετε. Μην ξεχάσετε την «Έξοδος» φεύγοντας.
          </p>
        </div>
      </div>
    </main>
  );
};
