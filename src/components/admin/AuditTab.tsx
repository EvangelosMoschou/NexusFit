"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCw,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  auditActionLabel,
  auditEntityLabel,
} from "@/lib/auditActions";

interface AuditEntryItem {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_email: string | null;
  actor_role: string;
  actor_legacy: boolean;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

interface AuditResponse {
  success: boolean;
  entries?: AuditEntryItem[];
  total?: number;
  limit?: number;
  offset?: number;
  error?: string;
}

const PAGE_SIZE = 50;

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toLocaleDateString("el-GR")} ${date.toLocaleTimeString("el-GR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
}

function roleLabel(role: string): string {
  if (role === "admin") return "Διαχειριστής";
  if (role === "trainer") return "Γυμναστής";
  if (role === "system") return "Σύστημα";
  return role;
}

function detailsSummary(details: Record<string, unknown>): string {
  const keys = Object.keys(details);
  if (keys.length === 0) return "—";
  if (Array.isArray(details.fields)) return `Πεδία: ${details.fields.join(", ")}`;
  return keys.map((key) => key).join(", ");
}

export const AuditTab: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (action) params.set("action", action);
      if (entityType) params.set("entityType", entityType);

      const res = await fetch(`/api/admin/audit?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as AuditResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Δεν ήταν δυνατή η φόρτωση του ιστορικού.");
      }

      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Σφάλμα φόρτωσης.");
    } finally {
      setLoading(false);
    }
  }, [offset, action, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(totalPages, Math.floor(offset / PAGE_SIZE) + 1);

  const changeAction = (value: string) => {
    setAction(value);
    setOffset(0);
  };

  const changeEntityType = (value: string) => {
    setEntityType(value);
    setOffset(0);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-primary flex items-center gap-2">
            <History className="w-4 h-4 text-accent" />
            Ιστορικό Ενεργειών
          </h2>
          <p className="text-xs text-secondary mt-1">
            Ποιος έκανε τι, πότε και από ποια IP. Κατακράτηση 12 μηνών· τα
            προσωπικά στοιχεία διαγραμμένων λογαριασμών ανωνυμοποιούνται.
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="audit-action" className="block text-[10px] text-tertiary mb-1">
            Ενέργεια
          </label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => changeAction(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-primary text-xs"
          >
            <option value="">Όλες οι ενέργειες</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="audit-entity" className="block text-[10px] text-tertiary mb-1">
            Τύπος αντικειμένου
          </label>
          <select
            id="audit-entity"
            value={entityType}
            onChange={(e) => changeEntityType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-primary text-xs"
          >
            <option value="">Όλοι οι τύποι</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-xs text-secondary">Φόρτωση ιστορικού...</div>
      ) : entries.length === 0 ? (
        <div className="p-6 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
          Δεν υπάρχουν καταγραφές για αυτά τα φίλτρα.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl bg-surface border border-border p-4 space-y-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded bg-surface-elevated text-accent mt-0.5">
                    {entry.actor_role === "admin" ? (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    ) : (
                      <UserCog className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-bold text-primary">{entry.actor_name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] border border-border bg-background text-secondary">
                        {roleLabel(entry.actor_role)}
                      </span>
                      {entry.actor_legacy && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border border-border bg-surface-elevated text-tertiary">
                          παλαιός
                        </span>
                      )}
                    </div>
                    {entry.actor_email && (
                      <div className="text-[10px] text-tertiary">{entry.actor_email}</div>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-tertiary font-mono sm:text-right">
                  {formatDateTime(entry.created_at)}
                  {entry.ip ? <div>IP: {entry.ip}</div> : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-semibold text-primary">
                  {auditActionLabel(entry.action)}
                </span>
                <span className="text-tertiary">→</span>
                <span className="text-secondary">
                  {auditEntityLabel(entry.entity_type)}
                  {entry.entity_id ? (
                    <span className="font-mono text-tertiary"> {entry.entity_id}</span>
                  ) : null}
                </span>
                <span className="text-tertiary">· {detailsSummary(entry.details)}</span>
              </div>

              {Object.keys(entry.details).length > 0 && (
                <details className="text-[10px] text-tertiary">
                  <summary className="cursor-pointer hover:text-primary">
                    Τεχνικές λεπτομέρειες
                  </summary>
                  <pre className="mt-2 p-2 rounded bg-background border border-border overflow-x-auto text-[10px] text-secondary">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-[11px] text-secondary">
        <span>
          {total} καταγραφές · σελίδα {page} / {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Προηγούμενη
          </button>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border disabled:opacity-40 flex items-center gap-1"
          >
            Επόμενη
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
