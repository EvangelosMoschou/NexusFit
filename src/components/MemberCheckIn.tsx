"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Lock, LogIn, LogOut, Users } from "lucide-react";

interface Occupancy {
  inside: number;
  capacity: number;
}

function formatTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

export const MemberCheckIn: React.FC = () => {
  const [inside, setInside] = useState(false);
  const [since, setSince] = useState<string | null>(null);
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
  const [visits30d, setVisits30d] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/member/visit", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setInside(Boolean(data.inside));
        setSince(data.since ?? null);
        setLocked(Boolean(data.locked));
        setSubscriptionActive(Boolean(data.subscriptionActive));
        setOccupancy(data.occupancy ?? null);
        setVisits30d(typeof data.visits30d === "number" ? data.visits30d : null);
      }
    } catch {
      // The card simply stays in its default state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the visit alive while the portal is actually being used. If the member
  // has already crossed the idle window, the server returns inside=false so the
  // UI does not pretend they are still checked in.
  useEffect(() => {
    if (!inside) return;

    const ping = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void fetch("/api/member/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat" }),
        keepalive: true,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && data.inside === false) {
            setInside(false);
            setSince(null);
          }
        })
        .catch(() => {});
    };

    const timer = setInterval(ping, 120_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [inside]);

  const toggle = async () => {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/member/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: inside ? "out" : "in" }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data?.locked) setLocked(true);
        if (data?.subscriptionActive === false) setSubscriptionActive(false);
        throw new Error(data.error || "Η ενέργεια απέτυχε.");
      }

      setInside(data.status === "in" || data.status === "already_in");
      setSince(data.since ?? null);
      setLocked(Boolean(data.locked));
      setSubscriptionActive(Boolean(data.subscriptionActive));
      setOccupancy(data.occupancy ?? null);
      setVisits30d(typeof data.visits30d === "number" ? data.visits30d : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η ενέργεια απέτυχε.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-surface border border-border text-xs text-secondary">
        Φόρτωση κατάστασης παρουσίας...
      </div>
    );
  }

  if (!subscriptionActive && !inside) {
    return (
      <div className="p-4 rounded-xl bg-surface border border-border flex items-start gap-3">
        <div className="p-2 rounded-lg bg-surface-elevated text-secondary">
          <Lock className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-bold text-primary">
            Η συνδρομή σου δεν είναι ενεργή
          </div>
          <div className="text-[11px] text-secondary mt-1 leading-relaxed">
            Η δήλωση εισόδου απαιτεί ενεργή συνδρομή. Για ανανέωση, επικοινώνησε
            με τη ρεσεψιόν.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg ${
            inside ? "bg-emerald-950/60 text-emerald-400" : "bg-surface-elevated text-secondary"
          }`}
        >
          {locked ? <Lock className="w-4 h-4" /> : <Users className="w-4 h-4" />}
        </div>
        <div>
          <div className="text-xs font-bold text-primary">
            {inside ? "Είσαι μέσα στο γυμναστήριο" : "Δεν έχεις δηλώσει είσοδο"}
          </div>
          <div className="text-[11px] text-secondary">
            {inside && since
              ? `Από τις ${formatTime(since)}`
              : "Δήλωσε είσοδο όταν φτάσεις για να ενημερώνεται η πληρότητα."}
            {!locked && occupancy && occupancy.capacity > 0
              ? ` • ${occupancy.inside}/${occupancy.capacity} μέσα τώρα`
              : ""}
            {inside ? " • Πάτησε «Τέλος προπόνησης» φεύγοντας." : ""}
          </div>
          {locked && (
            <div className="text-[10px] text-amber-300 mt-1 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Η πληρότητα & η πρόβλεψη είναι διαθέσιμες με Premium συνδρομή
              (Ψηφιακός Βοηθός).
            </div>
          )}
          {visits30d !== null && (
            <div className="text-[10px] text-tertiary mt-1">
              {visits30d} παρουσίες (30 ημέρες)
            </div>
          )}
          {error && <div className="text-[10px] text-red-400 mt-1">{error}</div>}
        </div>
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
          inside
            ? "bg-surface-elevated hover:bg-border text-primary border border-border"
            : "bg-accent hover:bg-accent-hover text-accent-ink"
        }`}
      >
        {inside ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
        <span>
          {busy ? "Αποθήκευση..." : inside ? "Τέλος προπόνησης" : "Δήλωση εισόδου"}
        </span>
      </button>
    </div>
  );
};
