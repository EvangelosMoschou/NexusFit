"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Dumbbell,
  Eye,
  EyeOff,
  LogOut,
  Megaphone,
  ShieldCheck,
  Users,
} from "lucide-react";
import { OccupancyTab } from "@/components/admin/OccupancyTab";
import { TrainerMemberList } from "@/components/trainer/TrainerMemberList";
import { AnnouncementsTab } from "@/components/admin/AnnouncementsTab";
import { ScheduleTab } from "@/components/admin/ScheduleTab";
import { GymConfig } from "@/types";
import { defaultGymConfig } from "@/config/gymConfig";
import type { StaffPermission } from "@/lib/staffPermissions";

interface TrainerSession {
  id: string;
  name: string;
  email: string;
  role: "admin" | "trainer";
  permissions: string[];
  legacy: boolean;
}

type TrainerTab = "occupancy" | "members" | "announcements" | "schedule";

function can(session: TrainerSession | null, permission: StaffPermission): boolean {
  return Boolean(
    session &&
      (session.role === "admin" || session.permissions.includes(permission))
  );
}

function firstTab(session: TrainerSession): TrainerTab {
  if (can(session, "occupancy_view")) return "occupancy";
  if (can(session, "members_view")) return "members";
  if (can(session, "announcements_manage")) return "announcements";
  if (can(session, "schedule_manage")) return "schedule";
  return "occupancy";
}

export const TrainerDashboard: React.FC = () => {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [session, setSession] = useState<TrainerSession | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<TrainerTab>("occupancy");
  const [config, setConfig] = useState<GymConfig>(defaultGymConfig);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedDay, setSelectedDay] = useState("Monday");

  const applySession = useCallback((staff: TrainerSession) => {
    setSession(staff);
    setAuthenticated(true);
    setActiveTab(firstTab(staff));
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/trainer/me", { cache: "no-store" });
      if (!res.ok) {
        setSession(null);
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      if (data?.success && data.staff) {
        applySession(data.staff as TrainerSession);
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    }
  }, [applySession]);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/trainer/config", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success && data.config) {
        setConfig(data.config);
        setConfigLoaded(true);
        setConfigError(null);
      } else {
        setConfigError(data.error || "Δεν ήταν δυνατή η φόρτωση του περιεχομένου.");
      }
    } catch {
      setConfigError("Σφάλμα σύνδεσης με τον server.");
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const canOccupancy = can(session, "occupancy_view");
  const canManageOccupancy = can(session, "occupancy_manage");
  const canMembers = can(session, "members_view");
  const canAnnouncements = can(session, "announcements_manage");
  const canSchedule = can(session, "schedule_manage");
  const needsConfig = canAnnouncements || canSchedule;

  useEffect(() => {
    if (authenticated && needsConfig && !configLoaded) {
      void loadConfig();
    }
  }, [authenticated, needsConfig, configLoaded, loadConfig]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/trainer/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Η σύνδεση απέτυχε.");
      }

      setPassword("");
      if (data.staff) {
        applySession(data.staff as TrainerSession);
      } else {
        await loadSession();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η σύνδεση απέτυχε.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/trainer/logout", { method: "POST" }).catch(() => {});
    setAuthenticated(false);
    setSession(null);
    setConfig(defaultGymConfig);
    setConfigLoaded(false);
    setConfigError(null);
  };

  const saveConfig = async () => {
    if (!configLoaded) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const body: { announcements?: GymConfig["announcements"]; schedule?: GymConfig["schedule"] } = {};
      if (canAnnouncements) body.announcements = config.announcements;
      if (canSchedule) body.schedule = config.schedule;

      const res = await fetch("/api/trainer/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Η αποθήκευση απέτυχε.");
      }
      if (data.config) setConfig(data.config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η αποθήκευση απέτυχε.");
    } finally {
      setSaving(false);
    }
  };

  if (authenticated === null) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <span className="text-xs text-secondary">Φόρτωση...</span>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-border rounded-xl p-6 shadow-2xl space-y-5">
          <div className="text-center space-y-1.5">
            <div className="w-11 h-11 rounded-xl bg-accent text-accent-ink flex items-center justify-center mx-auto">
              <Dumbbell className="w-5 h-5 stroke-[2.5]" />
            </div>
            <h1 className="text-lg font-bold text-primary tracking-tight">Χώρος Προσωπικού</h1>
            <p className="text-[11px] text-secondary">
              Σύνδεση με τον προσωπικό σου λογαριασμό. Τα δικαιώματα καθορίζονται
              από τον διαχειριστή του γυμναστηρίου.
            </p>
          </div>

          <form onSubmit={login} className="space-y-3">
            <div>
              <label htmlFor="trainer-email" className="block text-[11px] font-semibold text-secondary mb-1">
                Email προσωπικού (προαιρετικό)
              </label>
              <input
                id="trainer-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trainer@nexusathletics.gr"
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-primary text-xs outline-none focus:border-border-light font-mono"
              />
              <p className="text-[10px] text-tertiary mt-1">
                Για τον παλιό κοινό κωδικό προσωπικού, άφησέ το κενό.
              </p>
            </div>

            <div>
              <label htmlFor="trainer-password" className="block text-[11px] font-semibold text-secondary mb-1">
                Κωδικός
              </label>
              <div className="relative">
                <input
                  id="trainer-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3 pr-10 py-2.5 rounded-lg bg-background border border-border text-primary text-xs outline-none focus:border-border-light font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-2 p-1.5 rounded text-tertiary hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-btn hover:bg-btn-hover disabled:opacity-50 text-btn-ink font-bold text-xs transition-colors"
            >
              {busy ? "Έλεγχος..." : "Σύνδεση"}
            </button>
          </form>

          <Link
            href="/"
            className="text-[11px] text-secondary hover:text-primary flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Επιστροφή στο site
          </Link>
        </div>
      </main>
    );
  }

  const tabs: Array<{
    key: TrainerTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [];

  if (canOccupancy) tabs.push({ key: "occupancy", label: "Παρουσίες", icon: Activity });
  if (canMembers) tabs.push({ key: "members", label: "Μέλη", icon: Users });
  if (canAnnouncements) tabs.push({ key: "announcements", label: "Ανακοινώσεις", icon: Megaphone });
  if (canSchedule) tabs.push({ key: "schedule", label: "Πρόγραμμα", icon: Calendar });

  return (
    <main className="min-h-screen bg-background text-foreground pb-16">
      <header className="bg-surface border-b border-border sticky top-0 z-40 backdrop-blur-md py-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent text-accent-ink flex items-center justify-center">
              <Dumbbell className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-sm font-bold text-primary">{session?.name ?? "Χώρος Προσωπικού"}</div>
              <div className="text-[10px] text-tertiary flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {session?.legacy ? "Κοινός κωδικός προσωπικού" : "Λογαριασμός προσωπικού"}
                {session?.email ? ` • ${session.email}` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Αποθηκεύτηκε
              </span>
            )}
            {needsConfig && configLoaded && (
              <button
                type="button"
                onClick={() => void saveConfig()}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-btn hover:bg-btn-hover disabled:opacity-50 text-btn-ink text-xs font-bold"
              >
                {saving ? "Αποθήκευση..." : "Αποθήκευση"}
              </button>
            )}
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border text-secondary hover:text-primary text-xs"
            >
              Αρχική
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border text-secondary hover:text-primary text-xs flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Έξοδος
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {tabs.length === 0 ? (
          <div className="p-8 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
            Ο λογαριασμός σου δεν έχει ενεργά δικαιώματα. Επικοινώνησε με τον
            διαχειριστή του γυμναστηρίου.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap ${
                      activeTab === tab.key
                        ? "bg-btn text-btn-ink font-bold shadow-sm"
                        : "text-secondary hover:text-primary"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
                {error}
              </div>
            )}
            {configError && needsConfig && (
              <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
                {configError}
              </div>
            )}

            {activeTab === "occupancy" && canOccupancy && (
              <OccupancyTab
                endpoint="/api/trainer/occupancy"
                canManage={canManageOccupancy}
              />
            )}
            {activeTab === "members" && canMembers && <TrainerMemberList />}
            {activeTab === "announcements" && canAnnouncements && (
              configLoaded ? (
                <AnnouncementsTab config={config} setConfig={setConfig} />
              ) : (
                <div className="p-6 text-center text-xs text-secondary">
                  {configError ? "Δεν φορτώθηκε το περιεχόμενο." : "Φόρτωση..."}
                </div>
              )
            )}
            {activeTab === "schedule" && canSchedule && (
              configLoaded ? (
                <ScheduleTab
                  config={config}
                  setConfig={setConfig}
                  selectedDay={selectedDay}
                  onSelectedDayChange={setSelectedDay}
                />
              ) : (
                <div className="p-6 text-center text-xs text-secondary">
                  {configError ? "Δεν φορτώθηκε το περιεχόμενο." : "Φόρτωση..."}
                </div>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
};
