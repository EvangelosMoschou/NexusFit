import React, { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import type { PortalTab } from "@/components/MemberMenu";
import { Hero } from "@/components/Hero";
import { Announcements } from "@/components/Announcements";
import { Facilities } from "@/components/Facilities";
import { Timetable } from "@/components/Timetable";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { LeadBooking } from "@/components/LeadBooking";
import { Footer } from "@/components/Footer";
import { CookieBanner } from "@/components/CookieBanner";
import { ScrollTopButton } from "@/components/ScrollTopButton";
import { ScrollProgressBar } from "@/components/ScrollProgressBar";
import { FloatingContact } from "@/components/FloatingContact";
import { MemberPortalPage } from "@/components/dashboard/MemberPortalPage";
import { GymFloorLiteMode } from "@/components/dashboard/GymFloorLiteMode";
import { WorkoutWizard } from "@/components/ai/WorkoutWizard";
import { WorkoutDisplay } from "@/components/ai/WorkoutDisplay";
import { AICoachChatModal } from "@/components/ai/AICoachChatModal";
import { ManualWorkoutBuilderModal } from "@/components/workout/ManualWorkoutBuilderModal";
import { LoginModal } from "@/components/auth/LoginModal";
import { LegalModal } from "@/components/LegalModal";
import { SearchModal } from "@/components/SearchModal";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { GeneratedWorkoutPlan } from "@/types";
import { useUTM } from "@/lib/useUTM";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import { getCurrentMember, MemberUser, addPlanToMemberHistory, storeMemberSession } from "@/lib/auth";

function DemoBanner() {
  const resetDemo = () => {
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key && key.startsWith("nexusfit_")) storage.removeItem(key);
      }
    }
    window.location.reload();
  };

  return (
    <div className="fixed bottom-3 left-3 z-[80] max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface/95 px-3 py-2 text-[11px] text-secondary shadow-xl backdrop-blur flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
      <span>
        <strong className="text-white">Διαδραστική επίδειξη</strong> — τα δεδομένα μένουν σε αυτόν τον περιηγητή.
      </span>
      <span className="font-mono text-tertiary">Σύνδεση: NX-8492 / 1234</span>
      <button
        onClick={resetDemo}
        className="px-2 py-0.5 rounded bg-surface-elevated hover:bg-border text-white font-semibold"
      >
        Επαναφορά
      </button>
      <a
        href="https://github.com/EvangelosMoschou/NexusFit"
        className="text-accent hover:underline"
      >
        Πηγαίος κώδικας
      </a>
    </div>
  );
}

export function DemoApp() {
  const [member, setMember] = useState<MemberUser | null>(null);
  const [view, setView] = useState<"home" | "portal">("home");
  const [portalTab, setPortalTab] = useState<PortalTab>("overview");
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isAIWizardOpen, setIsAIWizardOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isManualBuilderOpen, setIsManualBuilderOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activePlan, setActivePlan] = useState<GeneratedWorkoutPlan | null>(null);
  const [selectedPlanName, setSelectedPlanName] = useState<string | undefined>(undefined);
  const [legalModalType, setLegalModalType] = useState<"tos" | "privacy" | null>(null);

  const network = useNetworkStatus();
  useUTM();

  useEffect(() => {
    const current = getCurrentMember();
    if (current) setMember(current);
  }, []);

  const isMemberAIActive = member?.subscription.hasAIAccess && member?.subscription.status === "active";

  const goHome = () => {
    setView("home");
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openMemberTab = (tab: PortalTab) => {
    setPortalTab(tab);
    setView("portal");
    window.scrollTo({ top: 0 });
  };

  const handleLogout = () => {
    setMember(null);
    setView("home");
  };

  const handleOpenContact = (planName?: string) => {
    if (planName) setSelectedPlanName(planName);
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  const handlePlanGenerated = (plan: GeneratedWorkoutPlan) => {
    setIsAIWizardOpen(false);
    setIsManualBuilderOpen(false);
    setActivePlan(plan);
    if (member) {
      const updated = addPlanToMemberHistory(plan);
      if (updated) setMember(updated);
      fetch("/api/member/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      }).catch(() => {});
    }
  };

  if (member && view === "portal" && network.isLiteMode) {
    return (
      <>
        <main className="min-h-screen bg-[#111317] text-white">
          <GymFloorLiteMode
            member={member}
            onExitLiteMode={network.toggleLiteMode}
            onViewPlan={(plan) => setActivePlan(plan)}
          />
          {activePlan && (
            <WorkoutDisplay
              plan={activePlan}
              onReset={() => setActivePlan(null)}
              onOpenBooking={() => setActivePlan(null)}
            />
          )}
        </main>
        <DemoBanner />
      </>
    );
  }

  if (member && view === "portal") {
    return (
      <>
        <main className="min-h-screen bg-background text-foreground relative">
          <ScrollProgressBar />
          <MemberPortalPage
            member={member}
            initialTab={portalTab}
            onGoHome={goHome}
            onLogout={handleLogout}
            onLaunchAIWizard={() => {
              if (isMemberAIActive) setIsAIWizardOpen(true);
            }}
            onLaunchAIChat={() => {
              if (isMemberAIActive) setIsAIChatOpen(true);
            }}
            onLaunchManualBuilder={() => setIsManualBuilderOpen(true)}
            onViewPlan={(plan) => setActivePlan(plan)}
            onToggleLiteMode={network.toggleLiteMode}
          />

          {isManualBuilderOpen && (
            <ManualWorkoutBuilderModal
              isOpen={isManualBuilderOpen}
              onClose={() => setIsManualBuilderOpen(false)}
              onSavePlan={handlePlanGenerated}
            />
          )}

          {isMemberAIActive && isAIChatOpen && (
            <AICoachChatModal isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
          )}

          {isMemberAIActive && isAIWizardOpen && (
            <WorkoutWizard
              onPlanGenerated={handlePlanGenerated}
              onClose={() => setIsAIWizardOpen(false)}
            />
          )}

          {activePlan && (
            <WorkoutDisplay
              plan={activePlan}
              onReset={() => {
                setActivePlan(null);
                if (isMemberAIActive) setIsAIWizardOpen(true);
                else setIsManualBuilderOpen(true);
              }}
              onOpenBooking={() => setActivePlan(null)}
            />
          )}

          <ScrollTopButton />
          <PWAInstallPrompt />
        </main>
        <DemoBanner />
      </>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-background text-foreground relative">
        <ScrollProgressBar />

        <Navbar
          onOpenContact={() => handleOpenContact()}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenLogin={() => setIsLoginOpen(true)}
          onGoHome={goHome}
          member={member}
          onLogout={handleLogout}
          onSelectMemberTab={openMemberTab}
        />

        <div id="main-content">
          <Hero
            onOpenContact={() => handleOpenContact()}
            onOpenLogin={() => (member ? openMemberTab("overview") : setIsLoginOpen(true))}
          />
          <Announcements />
          <Facilities />
          <Timetable onOpenBooking={() => handleOpenContact()} />
          <Pricing
            onSelectPlan={(planName) => handleOpenContact(planName)}
            onOpenAIWizard={() => setIsLoginOpen(true)}
          />
          <FAQ />
          <LeadBooking
            preselectedPlan={selectedPlanName}
            onOpenLegal={(type) => setLegalModalType(type)}
          />
        </div>

        <Footer onOpenLegal={(type) => setLegalModalType(type)} />
        <CookieBanner onOpenPrivacy={() => setLegalModalType("privacy")} />
        <ScrollTopButton />
        <FloatingContact />

        {isSearchOpen && (
          <SearchModal
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            onSelectExercise={() => setIsLoginOpen(true)}
          />
        )}

        <PWAInstallPrompt />

        {isLoginOpen && (
          <LoginModal
            isOpen={isLoginOpen}
            onClose={() => setIsLoginOpen(false)}
            onSuccess={(loggedMember) => {
              storeMemberSession(loggedMember);
              setMember(loggedMember);
            }}
          />
        )}

        {legalModalType && (
          <LegalModal type={legalModalType} onClose={() => setLegalModalType(null)} />
        )}
      </main>
      <DemoBanner />
    </>
  );
}
