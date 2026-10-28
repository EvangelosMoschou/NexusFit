"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/Navbar";
import type { PortalTab } from "@/components/MemberMenu";
import { Hero } from "@/components/Hero";
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
import { GeneratedWorkoutPlan } from "@/types";
import { useUTM } from "@/lib/useUTM";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import { getCurrentMember, MemberUser, addPlanToMemberHistory, storeMemberSession } from "@/lib/auth";

// Code-Splitting: Lazy-load heavy modals & views only when triggered
const MemberPortalPage = dynamic(
  () => import("@/components/dashboard/MemberPortalPage").then((mod) => mod.MemberPortalPage),
  { ssr: false }
);
const GymFloorLiteMode = dynamic(
  () => import("@/components/dashboard/GymFloorLiteMode").then((mod) => mod.GymFloorLiteMode),
  { ssr: false }
);
const WorkoutWizard = dynamic(
  () => import("@/components/ai/WorkoutWizard").then((mod) => mod.WorkoutWizard),
  { ssr: false }
);
const WorkoutDisplay = dynamic(
  () => import("@/components/ai/WorkoutDisplay").then((mod) => mod.WorkoutDisplay),
  { ssr: false }
);
const AICoachChatModal = dynamic(
  () => import("@/components/ai/AICoachChatModal").then((mod) => mod.AICoachChatModal),
  { ssr: false }
);
const ManualWorkoutBuilderModal = dynamic(
  () => import("@/components/workout/ManualWorkoutBuilderModal").then((mod) => mod.ManualWorkoutBuilderModal),
  { ssr: false }
);
const LoginModal = dynamic(
  () => import("@/components/auth/LoginModal").then((mod) => mod.LoginModal),
  { ssr: false }
);
const LegalModal = dynamic(
  () => import("@/components/LegalModal").then((mod) => mod.LegalModal),
  { ssr: false }
);
const SearchModal = dynamic(
  () => import("@/components/SearchModal").then((mod) => mod.SearchModal),
  { ssr: false }
);
const PWAInstallPrompt = dynamic(
  () => import("@/components/PWAInstallPrompt").then((mod) => mod.PWAInstallPrompt),
  { ssr: false }
);

export default function Home() {
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

  // Network speed detection (2G, slow 3G, offline, or manual low-signal toggle)
  const network = useNetworkStatus();

  // Capture UTM parameters
  useUTM();

  // Load session from cookies/storage
  useEffect(() => {
    const current = getCurrentMember();
    if (current) setMember(current);
  }, []);

  const isMemberAIActive = member?.subscription.hasAIAccess && member?.subscription.status === "active";

  // The brand always returns to the landing page, keeping the session intact.
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
    if (planName) {
      setSelectedPlanName(planName);
    }
    const contactSection = document.getElementById("contact");
    if (contactSection) {
      contactSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handlePlanGenerated = (plan: GeneratedWorkoutPlan) => {
    setIsAIWizardOpen(false);
    setIsManualBuilderOpen(false);
    setActivePlan(plan);
    // Automatically save to member's account history if logged in (device + server-side)
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

  // 1. If User is LOGGED IN and opened the member area:
  if (member && view === "portal") {
    // If on slow network / offline / lite mode -> Show Barebones Zero-Bandwidth Gym Floor View
    if (network.isLiteMode) {
      return (
        <main className="min-h-screen bg-[#111317] text-white">
          <GymFloorLiteMode
            member={member}
            onExitLiteMode={network.toggleLiteMode}
            onViewPlan={(plan) => setActivePlan(plan)}
          />

          {/* AI/Manual Workout Display Modal */}
          {activePlan && (
            <WorkoutDisplay
              plan={activePlan}
              onReset={() => setActivePlan(null)}
              onOpenBooking={() => setActivePlan(null)}
            />
          )}
        </main>
      );
    }

    // Standard Full Member Dashboard
    return (
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

        {/* Manual Workout Builder Modal */}
        {isManualBuilderOpen && (
          <ManualWorkoutBuilderModal
            isOpen={isManualBuilderOpen}
            onClose={() => setIsManualBuilderOpen(false)}
            onSavePlan={handlePlanGenerated}
          />
        )}

        {/* Live AI Agent Chat Modal */}
        {isMemberAIActive && isAIChatOpen && (
          <AICoachChatModal
            isOpen={isAIChatOpen}
            onClose={() => setIsAIChatOpen(false)}
          />
        )}

        {/* AI Wizard Modal */}
        {isMemberAIActive && isAIWizardOpen && (
          <WorkoutWizard
            onPlanGenerated={handlePlanGenerated}
            onClose={() => setIsAIWizardOpen(false)}
          />
        )}

        {/* AI/Manual Workout Display Modal */}
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
    );
  }

  // 2. If User is NOT Logged In -> Show Public Landing Page
  return (
    <main className="min-h-screen bg-background text-foreground relative">
      {/* Scroll Progress Bar */}
      <ScrollProgressBar />

      {/* Public Navigation */}
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
        {/* Public Hero */}
        <Hero
          onOpenContact={() => handleOpenContact()}
          onOpenLogin={() => (member ? openMemberTab("overview") : setIsLoginOpen(true))}
        />

        {/* Facilities */}
        <Facilities />

        {/* Timetable */}
        <Timetable onOpenBooking={() => handleOpenContact()} />

        {/* Pricing */}
        <Pricing
          onSelectPlan={(planName) => handleOpenContact(planName)}
          onOpenAIWizard={() => setIsLoginOpen(true)}
        />

        {/* Expandable FAQ */}
        <FAQ />

        {/* Contact & Inquiries Form */}
        <LeadBooking 
          preselectedPlan={selectedPlanName} 
          onOpenLegal={(type) => setLegalModalType(type)}
        />
      </div>

      {/* Footer */}
      <Footer onOpenLegal={(type) => setLegalModalType(type)} />

      {/* Cookie Consent Banner */}
      <CookieBanner onOpenPrivacy={() => setLegalModalType("privacy")} />

      {/* Scroll To Top Button */}
      <ScrollTopButton />

      {/* Floating Contact Action */}
      <FloatingContact />

      {/* Search Modal */}
      {isSearchOpen && (
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectExercise={() => setIsLoginOpen(true)}
        />
      )}

      {/* PWA Notification */}
      <PWAInstallPrompt />

      {/* Member Login Modal */}
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

      {/* Legal Modal (TOS / Privacy Policy) */}
      {legalModalType && (
        <LegalModal
          type={legalModalType}
          onClose={() => setLegalModalType(null)}
        />
      )}
    </main>
  );
}
