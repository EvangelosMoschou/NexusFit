"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Users,
  Calendar,
  Tag,
  Building2,
  Mail,
  Save,
  Check,
  AlertCircle,
  ArrowLeft,
  Dumbbell,
} from "lucide-react";
import { GymConfig } from "@/types";
import { defaultGymConfig } from "@/config/gymConfig";
import { LeadsTab, LeadItem } from "@/components/admin/LeadsTab";
import { MembersTab, MemberItem } from "@/components/admin/MembersTab";
import { PricingTab } from "@/components/admin/PricingTab";
import { ScheduleTab } from "@/components/admin/ScheduleTab";
import { InfoTab } from "@/components/admin/InfoTab";

export default function AdminPortalPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"leads" | "pricing" | "schedule" | "info" | "members">("leads");

  // Data States
  const [config, setConfig] = useState<GymConfig>(defaultGymConfig);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>("Monday");

  const fetchAdminData = async () => {
    try {
      // Fetch config, leads and members in parallel
      const [configRes, leadsRes, membersRes] = await Promise.all([
        fetch("/api/admin/config"),
        fetch("/api/admin/leads"),
        fetch("/api/admin/members"),
      ]);
      const [configData, leadsData, membersData] = await Promise.all([
        configRes.json(),
        leadsRes.json(),
        membersRes.json(),
      ]);

      if (configData.success && configData.config) {
        setConfig(configData.config);
      }
      if (leadsData.success && leadsData.leads) {
        setLeads(leadsData.leads);
      }
      if (membersData.success && membersData.members) {
        setMembers(membersData.members);
      }
    } catch {}
  };

  // Check auth session
  useEffect(() => {
    const authSession = sessionStorage.getItem("nexus_admin_auth");
    if (authSession === "true") {
      setIsAuthenticated(true);
      fetchAdminData();
    }
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPin }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setIsAuthenticated(true);
        sessionStorage.setItem("nexus_admin_auth", "true");
        fetchAdminData();
      } else {
        setLoginError(data.error || "Λανθασμένος κωδικός διαχειριστή.");
      }
    } catch {
      setLoginError("Σφάλμα σύνδεσης με τον server.");
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch {} finally {
      setIsSaving(false);
    }
  };

  const handleUpdateLeadStatus = async (id: string, status: "pending" | "contacted" | "registered") => {
    try {
      await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    } catch {}
  };

  const handleDeleteLead = async (id: string) => {
    if (!confirm("Είστε σίγουροι για τη διαγραφή αυτού του αιτήματος;")) return;
    try {
      const res = await fetch(`/api/admin/leads?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
      }
    } catch {}
  };

  const handleDeleteMember = async (id: string) => {
    if (!confirm("Είστε σίγουροι για τη διαγραφή αυτού του μέλους;")) return;
    try {
      const res = await fetch(`/api/admin/members?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== id));
      }
    } catch {}
  };

  // 1. If NOT authenticated -> Show Admin Login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-border rounded-xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-accent text-black font-extrabold flex items-center justify-center mx-auto shadow-md">
              <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Nexus Athletics — Πίνακας Διαχείρισης</h1>
            <p className="text-xs text-secondary">
              Πίνακας διαχείρισης τιμών, προγραμμάτων και μελών γυμναστηρίου.
            </p>
          </div>

          {loginError && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password"
                className="block text-[11px] font-semibold text-secondary mb-1"
              >
                Κωδικός Πρόσβασης Διαχειριστή (Admin Password)
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showAdminPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-background border border-border text-white text-xs outline-none focus:border-border-light font-mono"
                />
                <Lock className="w-4 h-4 text-tertiary absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword((visible) => !visible)}
                  aria-label={showAdminPassword ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"}
                  aria-pressed={showAdminPassword}
                  className="absolute right-2 top-2 p-1.5 rounded text-tertiary hover:text-white transition-colors"
                >
                  {showAdminPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-tertiary mt-1">Ο κωδικός διαχειριστή ορίζεται στη μεταβλητή ADMIN_PASSWORD του διακομιστή</p>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-white hover:bg-white/90 text-black font-bold text-xs transition-colors shadow-sm"
            >
              Είσοδος στον Πίνακα Ελέγχου
            </button>
          </form>

          <div className="text-center pt-2">
            <Link href="/" className="text-xs text-secondary hover:text-white flex items-center justify-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Επιστροφή στην Αρχική Σελίδα</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Authenticated Admin Dashboard
  const navTabs = [
    {
      key: "leads" as const,
      icon: Mail,
      label: `Αιτήματα & Leads (${leads.filter((l) => l.status === "pending").length})`,
    },
    { key: "members" as const, icon: Users, label: `Μέλη & Ψηφιακές Συνδρομές (${members.length})` },
    { key: "pricing" as const, icon: Tag, label: "Συνδρομές & Τιμοκατάλογος" },
    { key: "schedule" as const, icon: Calendar, label: "Ωρολόγιο Πρόγραμμα" },
    { key: "info" as const, icon: Building2, label: "Στοιχεία & Εγκαταστάσεις" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Top Navbar */}
      <header className="bg-surface border-b border-border sticky top-0 z-40 backdrop-blur-md py-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-8 h-8 rounded-lg bg-accent text-black font-extrabold flex items-center justify-center text-sm shadow-sm">
              <Dumbbell className="w-4 h-4 stroke-[2.5]" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">{config.gymName}</span>
                <span className="text-[10px] font-mono bg-accent/20 text-accent px-2 py-0.5 rounded font-bold">
                  Διαχείριση
                </span>
              </div>
              <div className="text-[10px] text-tertiary">Διαχείριση περιεχομένου & μελών</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-md animate-in fade-in">
                <Check className="w-3.5 h-3.5" /> Αποθηκεύτηκε!
              </span>
            )}

            <button
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-white hover:bg-white/90 text-black font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "Αποθήκευση..." : "Αποθήκευση Αλλαγών"}</span>
            </button>

            <button
              onClick={async () => {
                try {
                  await fetch("/api/admin/logout", { method: "POST" });
                } catch {}
                sessionStorage.removeItem("nexus_admin_auth");
                setIsAuthenticated(false);
              }}
              className="p-2 rounded-lg bg-surface-elevated hover:bg-border text-secondary hover:text-white border border-border text-xs"
              title="Αποσύνδεση"
            >
              Έξοδος
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key ? "bg-white text-black font-bold shadow-sm" : "text-secondary hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Panels */}
        {activeTab === "leads" && (
          <LeadsTab leads={leads} onRefresh={fetchAdminData} onUpdateStatus={handleUpdateLeadStatus} onDelete={handleDeleteLead} />
        )}
        {activeTab === "members" && (
          <MembersTab members={members} onRefresh={fetchAdminData} onDelete={handleDeleteMember} />
        )}
        {activeTab === "pricing" && <PricingTab config={config} setConfig={setConfig} />}
        {activeTab === "schedule" && (
          <ScheduleTab
            config={config}
            setConfig={setConfig}
            selectedDay={selectedDay}
            onSelectedDayChange={setSelectedDay}
          />
        )}
        {activeTab === "info" && <InfoTab config={config} setConfig={setConfig} />}
      </div>
    </div>
  );
}
