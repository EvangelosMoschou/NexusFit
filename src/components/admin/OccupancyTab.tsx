"use client";

import React, { useCallback, useEffect, useState } from "react";
import { LogOut, RefreshCw, Users } from "lucide-react";
import { OccupancyForecast } from "@/components/OccupancyForecast";

interface InsideMember {
  member_id: string;
  member_code: string;
  full_name: string;
  checked_in_at: string;
}

interface RecentVisit {
  id: string;
  member_code: string;
  full_name: string;
  checked_in_at: string;
  checked_out_at: string | null;
}

interface OccupancyData {
  inside: number;
  capacity: number;
  members: InsideMember[];
  recentVisits: RecentVisit[];
}

interface OccupancyTabProps {
  endpoint?: string;
  canManage?: boolean;
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("el-GR");
}

export const OccupancyTab: React.FC<OccupancyTabProps> = ({
  endpoint = "/api/admin/occupancy",
  canManage = true,
}) => {
  const [data, setData] = useState<OccupancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) {
        setData({
          inside: json.inside ?? 0,
          capacity: json.capacity ?? 0,
          members: Array.isArray(json.members) ? json.members : [],
          recentVisits: Array.isArray(json.recentVisits) ? json.recentVisits : [],
        });
        setError(null);
      } else {
        setError("Δεν ήταν δυνατή η φόρτωση των παρουσιών.");
      }
    } catch {
      setError("Σφάλμα σύνδεσης με τον server.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const checkOut = async (memberId: string) => {
    setBusyId(memberId);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, action: "out" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Η έξοδος απέτυχε.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η έξοδος απέτυχε.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-primary flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            Παρουσίες Γυμναστηρίου
          </h2>
          <p className="text-xs text-secondary mt-1">
            Ζωντανή πληρότητα και σημερινές είσοδοι/έξοδοι. Οι αδρανείς παρουσίες
            κλείνουν σύμφωνα με το όριο στις Πληροφορίες (και οπωσδήποτε μετά από
            8 ώρες).
            {!canManage && " Προβολή μόνο — δεν έχεις δικαίωμα check-in/out."}
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
        <div className="p-6 text-center text-xs text-secondary">Φόρτωση παρουσιών...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-surface border border-border">
              <div className="text-[10px] uppercase text-tertiary">Μέσα τώρα</div>
              <div className="text-3xl font-extrabold text-primary font-mono mt-1">
                {data?.inside ?? 0}
                {data?.capacity ? (
                  <span className="text-sm text-tertiary font-normal"> / {data.capacity}</span>
                ) : null}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-border">
              <div className="text-[10px] uppercase text-tertiary">Ελεύθερες θέσεις</div>
              <div className="text-3xl font-extrabold text-emerald-400 font-mono mt-1">
                {data?.capacity ? Math.max(0, data.capacity - data.inside) : "—"}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-border">
              <div className="text-[10px] uppercase text-tertiary">Καταγραφές (πρόσφατες)</div>
              <div className="text-3xl font-extrabold text-accent font-mono mt-1">
                {data?.recentVisits.length ?? 0}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-primary">Μέσα τώρα</h3>
            {data && data.members.length > 0 ? (
              <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
                {data.members.map((member) => (
                  <div
                    key={member.member_id}
                    className="p-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-accent">{member.member_code}</span>
                      <span className="text-primary font-semibold ml-2">{member.full_name}</span>
                      <div className="text-[10px] text-tertiary mt-0.5">
                        Από τις {formatTime(member.checked_in_at)}
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void checkOut(member.member_id)}
                        disabled={busyId === member.member_id}
                        className="px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-[11px] font-semibold border border-border flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Έξοδος
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
                Δεν είναι κανείς μέσα αυτή τη στιγμή.
              </div>
            )}
          </div>

          <OccupancyForecast />

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-primary">Πρόσφατες παρουσίες</h3>
            {data && data.recentVisits.length > 0 ? (
              <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
                {data.recentVisits.map((visit) => (
                  <div
                    key={visit.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-accent">{visit.member_code}</span>
                      <span className="text-primary font-semibold ml-2">{visit.full_name}</span>
                    </div>
                    <div className="text-[11px] text-tertiary font-mono">
                      {formatDate(visit.checked_in_at)} · {formatTime(visit.checked_in_at)} →{" "}
                      {visit.checked_out_at ? formatTime(visit.checked_out_at) : "μέσα"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
                Δεν υπάρχουν καταγραφές ακόμη.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
