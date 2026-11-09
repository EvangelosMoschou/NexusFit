"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Laptop, LogOut, RefreshCw, Smartphone } from "lucide-react";
import { memberFetch } from "@/lib/memberFetch";

interface MemberSessionInfo {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

interface MemberSessionsCardProps {
  onLogout: () => void;
  onLogoutAll: () => void;
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Άγνωστη συσκευή";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iPhone / iPad";
  if (/android/i.test(userAgent)) return "Android";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/macintosh|mac os/i.test(userAgent)) return "Mac";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Browser";
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("el-GR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export const MemberSessionsCard: React.FC<MemberSessionsCardProps> = ({
  onLogout,
  onLogoutAll,
}) => {
  const [sessions, setSessions] = useState<MemberSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await memberFetch("/api/member/sessions", { cache: "no-store" });
      if (!res.ok) {
        setError("Δεν ήταν δυνατή η φόρτωση των συνεδριών.");
        return;
      }
      const data = await res.json();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setError("Δεν ήταν δυνατή η φόρτωση των συνεδριών.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch; `load` deliberately owns the loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const revoke = async (session: MemberSessionInfo) => {
    if (session.current) {
      if (!confirm("Να αποσυνδεθείτε από αυτή τη συσκευή;")) return;
    } else if (!confirm("Να τερματιστεί η συγκεκριμένη συνεδρία;")) {
      return;
    }

    setBusyId(session.id);
    setError(null);
    try {
      const res = await memberFetch(`/api/member/sessions?id=${encodeURIComponent(session.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Η συνεδρία δεν τερματίστηκε. Δοκιμάστε ξανά.");
        return;
      }
      if (session.current) {
        onLogout();
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch {
      setError("Η συνεδρία δεν τερματίστηκε. Δοκιμάστε ξανά.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-5 rounded-xl bg-surface border border-border space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-primary">Συσκευές & Συνεδρίες</div>
          <p className="text-[11px] text-tertiary mt-1">Ενεργές συνδέσεις στον λογαριασμό σας.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="p-1.5 rounded-lg bg-surface-elevated hover:bg-border text-secondary border border-border transition-colors disabled:opacity-50"
          aria-label="Ανανέωση συνεδριών"
          title="Ανανέωση"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}

      {loading && sessions.length === 0 ? (
        <div className="text-[11px] text-tertiary">Φόρτωση συνεδριών…</div>
      ) : sessions.length === 0 ? (
        <div className="text-[11px] text-tertiary">Δεν βρέθηκαν ενεργές συνεδρίες.</div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {sessions.map((session) => (
            <div key={session.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {/iphone|ipad|ipod|android/i.test(session.userAgent ?? "") ? (
                    <Smartphone className="w-4 h-4 text-accent shrink-0" />
                  ) : (
                    <Laptop className="w-4 h-4 text-accent shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-primary flex items-center gap-2">
                      <span className="truncate">{deviceLabel(session.userAgent)}</span>
                      {session.current && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/70 font-mono">
                          Τρέχουσα
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-tertiary font-mono truncate">
                      ID: {session.id.slice(0, 12)}… · {session.ip ?? "χωρίς IP"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void revoke(session)}
                  disabled={busyId !== null}
                  className="shrink-0 text-[10px] text-red-300 hover:text-red-200 disabled:opacity-50"
                >
                  {busyId === session.id ? "…" : "Τερματισμός"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-tertiary">
                <span>Τελευταία δραστηριότητα: {formatTime(session.lastSeenAt)}</span>
                <span>Λήξη: {formatTime(session.expiresAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (confirm("Να αποσυνδεθείτε από όλες τις συσκευές, συμπεριλαμβανομένης αυτής;")) {
            onLogoutAll();
          }
        }}
        className="w-full px-3 py-2 rounded-lg bg-red-950/50 hover:bg-red-900/70 text-red-300 text-xs font-semibold border border-red-800/70 flex items-center justify-center gap-1.5 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Αποσύνδεση από όλες τις συσκευές</span>
      </button>
    </div>
  );
};
