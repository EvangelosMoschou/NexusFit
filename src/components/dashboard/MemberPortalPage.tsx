"use client";

import React, { useEffect, useState } from "react";
import { MemberUser, logoutMember, clearMemberSession } from "@/lib/auth";
import { MemberMenu, PortalTab } from "@/components/MemberMenu";
import { Barcode } from "@/components/Barcode";
import { GeneratedWorkoutPlan } from "@/types";
import { useGymConfig } from "@/lib/useGymConfig";
import { 
  Dumbbell, 
  Bot, 
  CheckCircle2, 
  ExternalLink, 
  Plus, 
  MessageSquareText, 
  Lock,
  Edit3,
  Wifi,
  Download,
  Trash2
} from "lucide-react";
import { getExerciseLogs } from "@/lib/storage";

interface MemberPortalPageProps {
  member: MemberUser;
  initialTab?: PortalTab;
  onGoHome: () => void;
  onLogout: () => void;
  onLaunchAIWizard: () => void;
  onLaunchAIChat: () => void;
  onLaunchManualBuilder: () => void;
  onViewPlan: (plan: GeneratedWorkoutPlan) => void;
  onToggleLiteMode: () => void;
}

export const MemberPortalPage: React.FC<MemberPortalPageProps> = ({
  member,
  initialTab = "overview",
  onGoHome,
  onLogout,
  onLaunchAIWizard,
  onLaunchAIChat,
  onLaunchManualBuilder,
  onViewPlan,
  onToggleLiteMode,
}) => {
  const { config } = useGymConfig();
  const [activeTab, setActiveTab] = useState<PortalTab>(initialTab);
  const [isErasing, setIsErasing] = useState(false);
  const exerciseLogs = getExerciseLogs();

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleLogout = () => {
    void logoutMember();
    onLogout();
  };

  // GDPR: fetch the export so it downloads as a file without leaving the page.
  const handleExportData = async () => {
    try {
      const res = await fetch("/api/member/export");
      if (!res.ok) return;
      const disposition = res.headers.get("content-disposition");
      const match = disposition?.match(/filename="?([^";]+)"?/);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? "nexusfit-member-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  // GDPR: erasure is irreversible and removes the member plus all saved plans.
  const handleEraseData = async () => {
    if (!confirm("Η ενέργεια είναι μη αναστρέψιμη. Να διαγραφούν οριστικά ο λογαριασμός και όλα τα προγράμματά σας;")) return;
    setIsErasing(true);
    try {
      const res = await fetch("/api/member/erase", { method: "DELETE" });
      if (res.ok) {
        clearMemberSession();
        onLogout();
      }
    } catch {} finally {
      setIsErasing(false);
    }
  };
  
  // Strict check: only active members with AI tier have AI access
  const isAIActive = member.subscription.hasAIAccess && member.subscription.status === "active";
  const latestPlan = member.savedPlans[0];

  // Today's classes from gym schedule
  const DAY_KEY_BY_JS_INDEX: Record<number, string> = {
    0: "Sunday",
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
  };
  const todayKey = DAY_KEY_BY_JS_INDEX[new Date().getDay()];
  const todayClasses = config.schedule.filter((s) => s.day === todayKey).slice(0, 4);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Member Portal Top Nav */}
      <header className="bg-surface border-b border-border py-4 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onGoHome}
            aria-label={`${config.gymName} - Επιστροφή στην αρχική σελίδα`}
            className="flex items-center gap-3 group"
          >
            <div className="w-8 h-8 rounded-lg bg-accent text-accent-ink font-extrabold flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition-transform">
              <Dumbbell className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="text-left">
              <span className="font-bold text-sm tracking-tight text-primary uppercase block">
                {config.gymName}
              </span>
              <span className="text-[10px] text-tertiary font-mono">Χώρος Μελών</span>
            </div>
          </button>

          <div className="flex items-center gap-2.5">
            {/* Manual Lite Mode Trigger */}
            <button
              onClick={onToggleLiteMode}
              className="px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-amber-300 text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
              title="Ενεργοποίηση λειτουργίας εξοικονόμησης δικτύου για το γυμναστήριο"
            >
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ελαφριά Λειτουργία</span>
            </button>

            <MemberMenu
              member={member}
              onSelectTab={setActiveTab}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      {/* Main Member Dashboard */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        
        {/* Welcome Header & Member Action Hub */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
          <div>
            <span className="text-[11px] font-mono text-accent uppercase font-bold">
              Προσωπικός Πίνακας Προπόνησης
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mt-1">
              Καλωσήρθατε, {member.fullName.split(" ")[0]}!
            </h1>
            <p className="text-secondary text-xs sm:text-sm mt-1">
              Η προσωπική σας πύλη για προγράμματα προπόνησης, καταγραφή προόδου και καθοδήγηση.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Manual Workout Builder (Available to ALL members) */}
            <button
              onClick={onLaunchManualBuilder}
              className="px-3.5 py-2.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-xs font-semibold flex items-center gap-1.5 transition-colors border border-border"
            >
              <Edit3 className="w-3.5 h-3.5 text-accent" />
              <span>Χειροκίνητο Πρόγραμμα</span>
            </button>

            {/* AI Features (Available exclusively to AI Pass members) */}
            {isAIActive ? (
              <>
                <button
                  onClick={onLaunchAIChat}
                  className="px-3.5 py-2.5 rounded-lg bg-surface-elevated hover:bg-border text-accent font-semibold text-xs flex items-center gap-2 transition-colors border border-border"
                >
                  <MessageSquareText className="w-4 h-4" />
                  <span>Συνομιλία με τον Προπονητή</span>
                </button>

                <button
                  onClick={onLaunchAIWizard}
                  className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-ink font-bold text-xs flex items-center gap-2 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Νέο Πρόγραμμα</span>
                </button>
              </>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-surface-elevated border border-border text-xs text-secondary flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-tertiary" />
                <span className="text-[11px]">Ψηφιακός Βοηθός: <strong className="text-tertiary">Βασικό Πακέτο</strong></span>
              </div>
            )}
          </div>
        </div>

        {/* 4 Key Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stat 1: Subscription Status */}
          <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
            <div className="text-[10px] font-mono uppercase text-tertiary">Συνδρομή Γυμναστηρίου</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary truncate">{member.subscription.tierName.split("(")[0]}</span>
              {member.subscription.status === "active" ? (
                <span className="text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-md font-mono font-bold">
                  Ενεργή
                </span>
              ) : (
                <span className="text-[10px] bg-red-950/60 text-red-400 border border-red-800/80 px-2 py-0.5 rounded-md font-mono font-bold">
                  Έληξε
                </span>
              )}
            </div>
            <div className="text-[11px] text-secondary">
              Λήξη: <span className="text-primary font-mono">{member.subscription.expiresAt}</span>
            </div>
          </div>

          {/* Stat 2: AI Access Status */}
          <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
            <div className="text-[10px] font-mono uppercase text-tertiary">Πρόσβαση Ψηφιακού Προπονητή</div>
            <div className="flex items-center gap-2">
              {isAIActive ? (
                <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Πλήρης Πρόσβαση
                </span>
              ) : (
                <span className="text-sm font-bold text-tertiary flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  Κλειδωμένο
                </span>
              )}
            </div>
            <div className="text-[11px] text-secondary">
              {isAIActive
                ? "Πρόγραμμα & συνομιλία ενεργά"
                : "Απαιτείται πρόσθετο πακέτο (+14€)"}
            </div>
          </div>

          {/* Stat 3: Total Saved Plans */}
          <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
            <div className="text-[10px] font-mono uppercase text-tertiary">Αποθηκευμένα Προγράμματα</div>
            <div className="text-2xl font-extrabold text-primary font-mono">
              {member.savedPlans.length}
            </div>
            <div className="text-[11px] text-secondary">Ιστορικό προπονήσεων</div>
          </div>

          {/* Stat 4: Overload Logs */}
          <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
            <div className="text-[10px] font-mono uppercase text-tertiary">Καταγραφές Κιλών</div>
            <div className="text-2xl font-extrabold text-accent font-mono">
              {exerciseLogs.length}
            </div>
            <div className="text-[11px] text-secondary">Καταγραφές προοδευτικής επιβάρυνσης</div>
          </div>
        </div>

        {/* Dashboard Tabs */}
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === "overview"
                ? "bg-btn text-btn-ink font-bold shadow-sm"
                : "text-secondary hover:text-primary"
            }`}
          >
            Επισκόπηση & Ενεργό Πρόγραμμα
          </button>
          <button
            onClick={() => setActiveTab("plans")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === "plans"
                ? "bg-btn text-btn-ink font-bold shadow-sm"
                : "text-secondary hover:text-primary"
            }`}
          >
            Ιστορικό Προγραμμάτων ({member.savedPlans.length})
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === "logs"
                ? "bg-btn text-btn-ink font-bold shadow-sm"
                : "text-secondary hover:text-primary"
            }`}
          >
            Καταγραφή Κιλών ({exerciseLogs.length})
          </button>
          <button
            onClick={() => setActiveTab("schedule")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === "schedule"
                ? "bg-btn text-btn-ink font-bold shadow-sm"
                : "text-secondary hover:text-primary"
            }`}
          >
            Σημερινά Μαθήματα Γυμναστηρίου
          </button>
        </div>

        {/* TAB 1: OVERVIEW & ACTIVE WORKOUT */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Active Routine Preview */}
            <div className="lg:col-span-8 space-y-4">
              <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-accent font-bold">
                      Ενεργό Πρόγραμμα
                    </span>
                    <h3 className="text-base font-bold text-primary mt-0.5">
                      {latestPlan ? latestPlan.splitName : "Δεν υπάρχει ενεργό πρόγραμμα"}
                    </h3>
                  </div>

                  {latestPlan && (
                    <button
                      onClick={() => onViewPlan(latestPlan)}
                      className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Άνοιγμα & Εκτύπωση</span>
                    </button>
                  )}
                </div>

                {latestPlan ? (
                  <div className="space-y-3">
                    <p className="text-xs text-secondary leading-relaxed bg-background p-3 rounded-lg border border-border">
                      <strong className="text-primary">Οδηγία: </strong>
                      {latestPlan.coachAdvice}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {latestPlan.days.slice(0, 2).map((day, idx) => (
                        <div key={idx} className="p-3.5 rounded-lg bg-background border border-border space-y-2">
                          <div className="text-xs font-bold text-primary flex items-center justify-between">
                            <span>{day.dayName}</span>
                            <span className="text-[10px] text-tertiary font-mono">{day.estimatedMinutes} λεπτά</span>
                          </div>
                          <div className="text-[11px] text-secondary">
                            Εστίαση: {day.focus}
                          </div>
                          <div className="text-[11px] text-accent font-mono pt-1">
                            {day.exercises.length} Ασκήσεις (π.χ. {day.exercises[0]?.greekName})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-4">
                    <p className="text-xs text-secondary">
                      Δεν έχετε καταχωρήσει ακόμα κάποιο προπονητικό πλάνο.
                    </p>
                    <div className="flex justify-center items-center gap-2">
                      <button
                        onClick={onLaunchManualBuilder}
                        className="px-4 py-2 rounded-lg bg-surface-elevated hover:bg-border text-primary font-semibold text-xs border border-border transition-colors flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-accent" />
                        <span>Χειροκίνητη Σύνταξη</span>
                      </button>

                      {isAIActive && (
                        <button
                          onClick={onLaunchAIWizard}
                          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-ink font-bold text-xs transition-colors shadow-sm"
                        >
                          Δημιουργία Προγράμματος
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: AI Coach / Actions Box */}
            <div className="lg:col-span-4 space-y-4">
              {isAIActive ? (
                <div className="p-5 rounded-xl bg-surface-card border border-border-light space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 text-accent">
                    <Bot className="w-5 h-5" />
                    <h3 className="text-sm font-bold text-primary">Βοήθεια Ψηφιακού Προπονητή</h3>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    Έχετε κάποια ενόχληση σε άρθρωση ή θέλετε να αντικαταστήσετε μία άσκηση στο γυμναστήριο;
                  </p>
                  <button
                    onClick={onLaunchAIChat}
                    className="w-full py-2.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageSquareText className="w-3.5 h-3.5 text-accent" />
                    <span>Ρωτήστε τον Ψηφιακό Προπονητή</span>
                  </button>
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-surface border border-border space-y-3">
                  <div className="flex items-center gap-2 text-tertiary">
                    <Lock className="w-4 h-4" />
                    <h3 className="text-xs font-bold text-primary">NexusFit Ψηφιακός Βοηθός (Κλειδωμένο)</h3>
                  </div>
                  <p className="text-[11px] text-secondary leading-relaxed">
                    Ο λογαριασμός σας διαθέτει βασική συνδρομή. Μπορείτε να φτιάξετε χειροκίνητα τα προγράμματά σας ή να αναβαθμίσετε για τον ψηφιακό προπονητή:
                  </p>
                  <div className="p-3 rounded-lg bg-background border border-border text-[11px] text-tertiary">
                    Απευθυνθείτε στη ρεσεψιόν του γυμναστηρίου για ενεργοποίηση του ψηφιακού βοηθού (+14€/μήνα).
                  </div>
                </div>
              )}

              {/* Gym Access Card */}
              <div className="p-5 rounded-xl bg-surface border border-border space-y-3">
                <div className="text-xs font-bold text-primary">Στοιχεία Κάρτας Μέλους</div>
                <div className="p-3 rounded-lg bg-background border border-border font-mono text-xs flex items-center justify-between">
                  <span className="text-tertiary">Κωδικός κάρτας:</span>
                  <span className="text-accent font-bold">{member.memberCode}</span>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <Barcode value={member.memberCode} height={56} />
                </div>
                <div className="text-[11px] text-tertiary leading-relaxed">
                  Δείξτε το barcode ή τον κωδικό μέλους στη ρεσεψιόν για είσοδο στους χώρους και στα ομαδικά.
                </div>
              </div>

              {/* GDPR: Data & Privacy Self-Service */}
              <div className="p-5 rounded-xl bg-surface border border-border space-y-3">
                <div className="text-xs font-bold text-primary">Τα Δεδομένα μου</div>
                <p className="text-[11px] text-tertiary leading-relaxed">
                  Σύμφωνα με τον GDPR μπορείτε να εξάγετε αντίγραφο ή να διαγράψετε οριστικά τα προσωπικά σας δεδομένα.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleExportData}
                    className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-accent" />
                    <span>Εξαγωγή Δεδομένων</span>
                  </button>
                  <button
                    onClick={handleEraseData}
                    disabled={isErasing}
                    className="px-3 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/70 text-red-300 text-xs font-semibold border border-red-800/70 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isErasing ? "Διαγραφή..." : "Διαγραφή Λογαριασμού"}</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: PLANS ARCHIVE */}
        {activeTab === "plans" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-secondary">
                Όλα τα προγράμματα προπόνησης (ψηφιακά & χειροκίνητα):
              </div>
              <button
                onClick={onLaunchManualBuilder}
                className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                <span>Νέο Χειροκίνητο Πρόγραμμα</span>
              </button>
            </div>

            {member.savedPlans.length > 0 ? (
              member.savedPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-4 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-border-light transition-colors"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-primary flex items-center gap-2">
                      <span>{plan.splitName}</span>
                      {plan.splitType === "custom" && (
                        <span className="text-[10px] bg-surface-elevated text-secondary px-1.5 py-0.5 rounded border border-border font-mono">
                          Manual
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-secondary">
                      {plan.daysPerWeek} Ημέρες • {plan.sessionDuration} λεπτά
                    </div>
                    <div className="text-[10px] text-tertiary font-mono">
                      Καταχωρήθηκε: {new Date(plan.createdAt).toLocaleDateString("el-GR")}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onViewPlan(plan)}
                      className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Προβολή & Εκτύπωση</span>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center bg-surface rounded-xl border border-border space-y-3">
                <div className="text-xs text-secondary">Δεν έχετε αποθηκευμένα προγράμματα ακόμα.</div>
                <button
                  onClick={onLaunchManualBuilder}
                  className="px-4 py-2 rounded-lg bg-btn text-btn-ink font-bold text-xs"
                >
                  Δημιουργία Προγράμματος
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: OVERLOAD LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-3">
            <div className="text-xs text-secondary">
              Πρόσφατα κιλά που καταγράψατε κατά την εκτέλεση των ασκήσεων στο γυμναστήριο:
            </div>
            {exerciseLogs.length > 0 ? (
              <div className="divide-y divide-border border border-border rounded-xl bg-surface">
                {exerciseLogs.map((log, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-primary font-mono">{log.exerciseId}</div>
                      <div className="text-[10px] text-tertiary">Ημερομηνία: {log.date}</div>
                    </div>
                    <div className="font-mono font-bold text-accent text-sm">
                      {log.weightKg} kg
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-tertiary bg-surface rounded-xl border border-border">
                Δεν υπάρχουν ακόμη καταγεγραμμένα βάρη.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TODAY'S CLASSES */}
        {activeTab === "schedule" && (
          <div className="space-y-3">
            <div className="text-xs text-secondary">
              Σημερινά ομαδικά προγράμματα στο Nexus Athletics (περιλαμβάνονται στη συνδρομή):
            </div>
            {todayClasses.length > 0 ? (
              <div className="divide-y divide-border border border-border rounded-xl bg-surface">
                {todayClasses.map((item) => (
                  <div key={item.id} className="p-4 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-bold text-accent">{item.time}</span>
                      <div>
                        <div className="font-bold text-primary">{item.className}</div>
                        <div className="text-[11px] text-tertiary">
                          {item.category} • Προπονητής: {item.trainer}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-elevated text-secondary border border-border">
                      {item.duration}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-tertiary bg-surface rounded-xl border border-border">
                Δεν υπάρχουν προγραμματισμένα μαθήματα σήμερα.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
