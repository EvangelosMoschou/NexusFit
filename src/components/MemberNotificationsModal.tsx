"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bell, CalendarClock, CheckCheck, Megaphone, X } from "lucide-react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { memberFetch } from "@/lib/memberFetch";

interface MemberNotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

interface MemberNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toLocaleDateString("el-GR")} ${date.toLocaleTimeString("el-GR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
}

function NotificationIcon({ type }: { type: string }) {
  const className = "w-4 h-4";
  if (type === "expiry") return <AlertTriangle className={className} />;
  if (type === "announcement") return <Megaphone className={className} />;
  if (type === "schedule") return <CalendarClock className={className} />;
  return <Bell className={className} />;
}

export const MemberNotificationsModal: React.FC<MemberNotificationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [notifications, setNotifications] = useState<MemberNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(isOpen, onClose);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await memberFetch("/api/member/notifications", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων.");
      }
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Σφάλμα φόρτωσης.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const notifyChanged = () => {
    window.dispatchEvent(new Event("nexusfit:notifications-updated"));
  };

  const markAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await memberFetch("/api/member/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Η ενέργεια απέτυχε.");
      }
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) => (item.read_at ? item : { ...item, read_at: now }))
      );
      setUnreadCount(0);
      notifyChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η ενέργεια απέτυχε.");
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (item: MemberNotificationItem) => {
    if (item.read_at) return;
    try {
      const res = await memberFetch("/api/member/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) return;

      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, read_at: now } : entry))
      );
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      notifyChanged();
    } catch {
      // Leave the unread state as it was.
    }
  };

  if (!isOpen) return null;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ειδοποιήσεις μέλους"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80"
    >
      <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-primary flex items-center gap-2">
              <Bell className="w-4 h-4 text-accent" />
              Ειδοποιήσεις
            </h2>
            <p className="text-[10px] text-tertiary mt-0.5">
              {unreadCount > 0 ? `${unreadCount} μη αναγνωσμένες` : "Όλες διαβασμένες"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                disabled={busy}
                className="px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border text-primary text-[10px] font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Όλα ως αναγνωσμένα
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Κλείσιμο"
              className="p-1.5 rounded text-secondary hover:text-primary hover:bg-surface-elevated"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-2 space-y-1.5">
          {loading ? (
            <div className="p-6 text-center text-xs text-secondary">Φόρτωση...</div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
              {error}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-secondary">
              Δεν έχεις ειδοποιήσεις ακόμη.
            </div>
          ) : (
            notifications.map((item) => {
              const unread = !item.read_at;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markOne(item)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    unread
                      ? "bg-accent/10 border-accent/30 hover:bg-accent/15"
                      : "bg-background border-border hover:bg-surface-elevated"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        unread ? "bg-accent text-accent-ink" : "bg-surface-elevated text-secondary"
                      }`}
                    >
                      <NotificationIcon type={item.type} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary">{item.title}</span>
                        {unread && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                      </div>
                      <p className="text-[11px] text-secondary mt-1 leading-relaxed">{item.body}</p>
                      <div className="text-[10px] text-tertiary font-mono mt-1.5">
                        {formatDate(item.created_at)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
};
