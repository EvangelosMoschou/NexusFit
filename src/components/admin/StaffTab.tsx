"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Plus,
  Save,
  Shield,
  Trash2,
  UserCog,
} from "lucide-react";
import {
  STAFF_PERMISSION_DEFINITIONS,
  TRAINER_DEFAULT_PERMISSIONS,
  type StaffPermission,
} from "@/lib/staffPermissions";

interface StaffItem {
  id: string;
  name: string;
  email: string;
  role: "admin" | "trainer";
  permissions: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

interface CreateForm {
  name: string;
  email: string;
  role: "admin" | "trainer";
  password: string;
  permissions: StaffPermission[];
}

const EMPTY_FORM: CreateForm = {
  name: "",
  email: "",
  role: "trainer",
  password: "",
  permissions: [...TRAINER_DEFAULT_PERMISSIONS],
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toLocaleDateString("el-GR")} ${date.toLocaleTimeString("el-GR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
}

export const StaffTab: React.FC = () => {
  const [accounts, setAccounts] = useState<StaffItem[]>([]);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.staff)) {
        setAccounts(data.staff);
        setError(null);
      } else {
        setError(data.error || "Δεν ήταν δυνατή η φόρτωση των λογαριασμών.");
      }
    } catch {
      setError("Σφάλμα σύνδεσης με τον server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3500);
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          role: form.role,
          password: form.password,
          permissions: form.role === "trainer" ? form.permissions : [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Η δημιουργία απέτυχε.");

      setForm(EMPTY_FORM);
      flash("Ο λογαριασμός δημιουργήθηκε.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η δημιουργία απέτυχε.");
    } finally {
      setCreating(false);
    }
  };

  const togglePermission = (accountId: string, permission: StaffPermission) => {
    setAccounts((prev) =>
      prev.map((account) => {
        if (account.id !== accountId) return account;
        const has = account.permissions.includes(permission);
        let permissions = has
          ? account.permissions.filter((key) => key !== permission)
          : [...account.permissions, permission];
        if (permission === "occupancy_manage" && !has && !permissions.includes("occupancy_view")) {
          permissions = [...permissions, "occupancy_view"];
        }
        return { ...account, permissions };
      })
    );
  };

  const saveAccount = async (account: StaffItem) => {
    setBusyId(account.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: account.id,
          active: account.active,
          permissions: account.role === "trainer" ? account.permissions : [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Η ενημέρωση απέτυχε.");
      flash("Τα δικαιώματα αποθηκεύτηκαν.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η ενημέρωση απέτυχε.");
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (id: string) => {
    const password = passwordDrafts[id] ?? "";
    if (password.length < 8) {
      setError("Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.");
      return;
    }

    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Η αλλαγή κωδικού απέτυχε.");
      setPasswordDrafts((prev) => ({ ...prev, [id]: "" }));
      flash("Ο κωδικός άλλαξε. Οι παλιές συνεδρίες ακυρώθηκαν.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η αλλαγή κωδικού απέτυχε.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteAccount = async (account: StaffItem) => {
    const confirmed = window.confirm(
      `ΟΡΙΣΤΙΚΗ ΔΙΑΓΡΑΦΗ (GDPR)\n\nΘα διαγραφούν οριστικά για τον λογαριασμό ${account.name} (${account.email}):\n` +
        "• όνομα και email\n• hash κωδικού\n• ρόλος και permissions\n• όλες οι ενεργές συνεδρίες\n\n" +
        "Το ιστορικό ενεργειών θα ανωνυμοποιηθεί (όχι διαγραφεί), για σκοπούς ασφάλειας.\n" +
        "Η ενέργεια δεν αναιρείται."
    );
    if (!confirmed) return;

    setBusyId(account.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/staff?id=${encodeURIComponent(account.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Η διαγραφή απέτυχε.");
      flash("Ο λογαριασμός διαγράφηκε οριστικά.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η διαγραφή απέτυχε.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-primary flex items-center gap-2">
          <UserCog className="w-4 h-4 text-accent" />
          Λογαριασμοί Προσωπικού
        </h2>
        <p className="text-xs text-secondary mt-1">
          Δημιούργησε πολλούς διαχειριστές ή γυμναστές και όρισε granular δικαιώματα.
          Η διαγραφή είναι οριστική και ακυρώνει αμέσως τις συνεδρίες του λογαριασμού.
        </p>
      </div>

      {error && (
        <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-800/60 text-[11px] text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {success}
        </div>
      )}

      <form onSubmit={createAccount} className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="text-xs font-bold text-primary flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-accent" />
          Νέος λογαριασμός
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] text-secondary mb-1">Ονοματεπώνυμο</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-secondary mb-1">Email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-secondary mb-1">Ρόλος</label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  role: e.target.value as "admin" | "trainer",
                }))
              }
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
            >
              <option value="trainer">Γυμναστής</option>
              <option value="admin">Διαχειριστής</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-secondary mb-1">
              Αρχικός κωδικός (8+)
            </label>
            <input
              required
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs font-mono"
            />
          </div>
        </div>

        {form.role === "trainer" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STAFF_PERMISSION_DEFINITIONS.map((permission) => (
              <label
                key={permission.key}
                className="flex items-start gap-2 p-2.5 rounded-lg bg-background border border-border text-[11px] text-secondary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={form.permissions.includes(permission.key)}
                  onChange={() =>
                    setForm((prev) => {
                      const has = prev.permissions.includes(permission.key);
                      let permissions = has
                        ? prev.permissions.filter((key) => key !== permission.key)
                        : [...prev.permissions, permission.key];
                      if (
                        permission.key === "occupancy_manage" &&
                        !has &&
                        !permissions.includes("occupancy_view")
                      ) {
                        permissions = [...permissions, "occupancy_view"];
                      }
                      return { ...prev, permissions };
                    })
                  }
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  <strong className="block text-primary">{permission.label}</strong>
                  {permission.description}
                </span>
              </label>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 rounded-lg bg-btn hover:bg-btn-hover disabled:opacity-50 text-btn-ink font-bold text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          {creating ? "Δημιουργία..." : "Δημιουργία λογαριασμού"}
        </button>
      </form>

      {loading ? (
        <div className="p-6 text-center text-xs text-secondary">Φόρτωση λογαριασμών...</div>
      ) : accounts.length === 0 ? (
        <div className="p-6 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
          Δεν υπάρχουν λογαριασμοί προσωπικού. Ο κύριος κωδικός ADMIN_PASSWORD λειτουργεί
          πάντα ως εφεδρικός owner.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-xl bg-surface border border-border p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-primary">{account.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                        account.role === "admin"
                          ? "bg-accent/15 text-accent border-accent/40"
                          : "bg-surface-elevated text-secondary border-border"
                      }`}
                    >
                      {account.role === "admin" ? "Διαχειριστής" : "Γυμναστής"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        account.active
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                          : "bg-red-950/50 text-red-300 border-red-800"
                      }`}
                    >
                      {account.active ? "Ενεργός" : "Ανενεργός"}
                    </span>
                  </div>
                  <div className="text-[11px] text-secondary mt-1">{account.email}</div>
                  <div className="text-[10px] text-tertiary mt-0.5">
                    Τελευταία σύνδεση: {formatDate(account.last_login_at)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={account.active}
                      onChange={() =>
                        setAccounts((prev) =>
                          prev.map((item) =>
                            item.id === account.id ? { ...item, active: !item.active } : item
                          )
                        )
                      }
                      className="accent-[var(--accent)]"
                    />
                    Ενεργός
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveAccount(account)}
                    disabled={busyId === account.id}
                    className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-border border border-border text-primary text-[11px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Αποθήκευση
                  </button>
                </div>
              </div>

              {account.role === "trainer" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STAFF_PERMISSION_DEFINITIONS.map((permission) => (
                    <label
                      key={permission.key}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-background border border-border text-[11px] text-secondary cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={account.permissions.includes(permission.key)}
                        onChange={() => togglePermission(account.id, permission.key)}
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                      <span>
                        <strong className="block text-primary">{permission.label}</strong>
                        {permission.description}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-background border border-border text-[11px] text-secondary flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-accent" />
                  Πλήρης πρόσβαση διαχειριστή
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-border/60">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-tertiary" />
                  <input
                    type="password"
                    minLength={8}
                    placeholder="Νέος κωδικός (8+)"
                    value={passwordDrafts[account.id] ?? ""}
                    onChange={(e) =>
                      setPasswordDrafts((prev) => ({ ...prev, [account.id]: e.target.value }))
                    }
                    className="px-2.5 py-1.5 rounded bg-background border border-border text-primary text-[11px] font-mono w-44"
                  />
                  <button
                    type="button"
                    onClick={() => void resetPassword(account.id)}
                    disabled={busyId === account.id || (passwordDrafts[account.id] ?? "").length < 8}
                    className="px-2.5 py-1.5 rounded bg-surface-elevated hover:bg-border border border-border text-primary text-[11px] font-semibold disabled:opacity-40"
                  >
                    Αλλαγή
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void deleteAccount(account)}
                  disabled={busyId === account.id}
                  className="px-3 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/70 text-red-300 border border-red-800/70 text-[11px] font-semibold flex items-center gap-1.5 self-start disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Οριστική διαγραφή (GDPR)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-tertiary leading-relaxed">
        Ο κύριος κωδικός <span className="font-mono">ADMIN_PASSWORD</span> παραμένει
        εφεδρικός owner και δεν εμφανίζεται εδώ. Η αλλαγή κωδικού ή η διαγραφή
        ακυρώνει αμέσως τις παλιές συνεδρίες του λογαριασμού.
      </p>
    </div>
  );
};
