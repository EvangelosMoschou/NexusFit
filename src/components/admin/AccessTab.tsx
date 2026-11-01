"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock,
  RefreshCw,
  ShieldAlert,
  User,
} from "lucide-react";
import { MemberDetailModal } from "@/components/admin/MemberDetailModal";

interface AccessAlertItem {
  member_id: string;
  member_code: string;
  full_name: string;
  event_count: number;
  last_event_at: string;
  event_types: string[];
}

interface AccessEventItem {
  id: string;
  member_id: string;
  member_code: string;
  full_name: string;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface AccessResponse {
  success: boolean;
  alerts?: AccessAlertItem[];
  recentEvents?: AccessEventItem[];
  threshold?: number;
  windowDays?: number;
  quickReentryMinutes?: number;
  error?: string;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toLocaleDateString("el-GR")} ${date.toLocaleTimeString("el-GR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
}

function eventLabel(type: string): string {
  if (type === "duplicate_entry") return "Διπλό check-in";
  if (type === "quick_reentry") return "Γρήγορη επανείσοδος";
  return type;
}

export const AccessTab: React.FC = () => {
  const [alerts, setAlerts] = useState<AccessAlertItem[]>([]);
  const [events, setEvents] = useState<AccessEventItem[]>([]);
  const [windowDays, setWindowDays] = useState(7);
  const [quickMinutes, setQuickMinutes] = useState(30);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/access", { cache: "no-store" });
      const data = (await res.json()) as AccessResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Δεν ήταν δυνατή η φόρτωση της παρακολούθησης.");
      }
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      setEvents(Array.isArray(data.recentEvents) ? data.recentEvents : []);
      if (typeof data.windowDays === "number") setWindowDays(data.windowDays);
      if (typeof data.quickReentryMinutes === "number") {
        setQuickMinutes(data.quickReentryMinutes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Σφάλμα φόρτωσης.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-primary flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-accent" />
            Παρακολούθηση Πρόσβασης
          </h2>
          <p className="text-xs text-secondary mt-1">
            Alarm όταν ένα μέλος έχει περισσότερα από ένα επαναλαμβανόμενα
            check-in σε {windowDays} ημέρες. Γρήγορη επανείσοδος = έξοδος και
            είσοδος μέσα σε {quickMinutes} λεπτά.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-1.5 rounded-lg bg-surface border border-border text-secondary hover:text-primary text-xs flex items-center gap-1.5 self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Ανανέωση
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-xs text-secondary">Φόρτωση...</div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-primary">
                Ενεργά alarms ({alerts.length})
              </h3>
            </div>

            {alerts.length === 0 ? (
              <div className="p-5 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
                Δεν υπάρχουν επαναλαμβανόμενες προσπάθειες πρόσβασης.
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.member_id}
                    className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/50 space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-amber-300">
                            {alert.member_code}
                          </span>
                          <span className="text-sm font-bold text-primary">
                            {alert.full_name}
                          </span>
                        </div>
                        <div className="text-[11px] text-secondary mt-1">
                          <strong className="text-amber-300">{alert.event_count}</strong>{" "}
                          συμβάντα / {windowDays} ημέρες · τελευταίο:{" "}
                          {formatDateTime(alert.last_event_at)}
                        </div>
                        <div className="text-[10px] text-tertiary mt-1">
                          {alert.event_types.map(eventLabel).join(" · ")}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberId(alert.member_id)}
                        className="px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border text-primary text-[11px] font-semibold flex items-center gap-1.5 self-start"
                      >
                        <User className="w-3.5 h-3.5" />
                        Προφίλ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-tertiary" />
              <h3 className="text-xs font-bold text-primary">Πρόσφατα συμβάντα</h3>
            </div>

            {events.length === 0 ? (
              <div className="p-5 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
                Δεν υπάρχουν καταγραφές.
              </div>
            ) : (
              <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-accent">
                        {event.member_code}
                      </span>
                      <span className="text-primary font-semibold ml-2">
                        {event.full_name}
                      </span>
                      <span className="text-secondary ml-2">
                        {eventLabel(event.event_type)}
                      </span>
                    </div>
                    <div className="text-[10px] text-tertiary font-mono sm:text-right">
                      {formatDateTime(event.created_at)}
                      {typeof event.details.direction === "string" ? (
                        <span> · {event.details.direction}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {selectedMemberId && (
        <MemberDetailModal
          memberId={selectedMemberId}
          onClose={() => setSelectedMemberId(null)}
        />
      )}
    </div>
  );
};
