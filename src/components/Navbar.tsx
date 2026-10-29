"use client";

import React, { useState } from "react";
import { useGymConfig } from "@/lib/useGymConfig";
import { Menu, X, Search, LogIn, Dumbbell } from "lucide-react";
import { MemberMenu, PortalTab } from "@/components/MemberMenu";
import { MemberUser } from "@/lib/auth";
import { scrollToSection } from "@/lib/scroll";

interface NavbarProps {
  onOpenContact: () => void;
  onOpenSearch: () => void;
  onOpenLogin: () => void;
  onGoHome: () => void;
  member?: MemberUser | null;
  onLogout?: () => void;
  onSelectMemberTab?: (tab: PortalTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenContact,
  onOpenSearch,
  onOpenLogin,
  onGoHome,
  member,
  onLogout,
  onSelectMemberTab,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { config } = useGymConfig();

  const publicNavLinks = [
    { label: "Εγκαταστάσεις", id: "facilities" },
    ...(config.announcements?.length ? [{ label: "Ανακοινώσεις", id: "announcements" }] : []),
    { label: "Πρόγραμμα", id: "schedule" },
    { label: "Συνδρομές", id: "pricing" },
    { label: "Ασκήσεις", id: "exercises" },
    { label: "Επικοινωνία", id: "contact" },
  ];

  const memberMenu =
    member && onLogout && onSelectMemberTab ? (
      <MemberMenu member={member} onSelectTab={onSelectMemberTab} onLogout={onLogout} />
    ) : null;

  return (
    <>
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const target = document.getElementById("main-content");
          if (!target) return;
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
          target.scrollIntoView({ behavior: "smooth" });
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 z-[70] px-4 py-2 bg-white text-black text-xs font-bold rounded-lg shadow-lg"
      >
        Μετάβαση στο περιεχόμενο
      </a>

      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/95 border-b border-border py-3.5 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          {/* Brand Logo */}
          <button
            type="button"
            onClick={onGoHome}
            aria-label={`${config.gymName} - Επιστροφή στην αρχική σελίδα`}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-lg bg-accent text-accent-ink font-extrabold flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition-transform">
              <Dumbbell className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="font-bold text-base tracking-tight text-primary uppercase whitespace-nowrap">
              {config.gymName}
            </span>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-4 2xl:gap-6">
            {publicNavLinks.map((link) => (
              <a
                key={link.label}
                href={`#${link.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection(link.id);
                }}
                className="text-xs font-semibold text-secondary hover:text-primary transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Action Buttons */}
          <div className="hidden xl:flex items-center gap-2">
            <button
              onClick={onOpenSearch}
              aria-label="Αναζήτηση"
              className="p-2 rounded-lg bg-surface border border-border text-secondary hover:text-primary hover:bg-surface-elevated transition-colors flex items-center gap-1.5 text-xs"
              title="Αναζήτηση"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {memberMenu ?? (
              <button
                onClick={onOpenLogin}
                className="px-3.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-accent" />
                <span>Σύνδεση Μέλους</span>
              </button>
            )}

            <button
              onClick={onOpenContact}
              className="px-4 py-2 rounded-lg bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs tracking-tight transition-colors shadow-sm"
            >
              Επικοινωνία & Επίσκεψη
            </button>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex items-center gap-2 xl:hidden">
            {memberMenu ?? (
              <button
                onClick={onOpenLogin}
                className="px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border text-xs font-bold text-primary"
              >
                Σύνδεση
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg border border-border text-primary"
              aria-label={mobileMenuOpen ? "Κλείσιμο μενού" : "Άνοιγμα μενού"}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="xl:hidden bg-surface border-b border-border px-5 py-4 space-y-3">
            {publicNavLinks.map((link) => (
              <a
                key={link.label}
                href={`#${link.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  setMobileMenuOpen(false);
                  scrollToSection(link.id);
                }}
                className="block py-2 text-sm font-medium text-secondary hover:text-primary border-b border-border/40"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 space-y-2">
              {!memberMenu && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenLogin();
                  }}
                  className="w-full py-2.5 rounded-lg bg-surface-elevated border border-border text-primary font-bold text-xs text-center"
                >
                  Σύνδεση Μέλους
                </button>
              )}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenContact();
                }}
                className="w-full py-2.5 rounded-lg bg-btn text-btn-ink font-bold text-xs text-center"
              >
                Επικοινωνία & Επίσκεψη
              </button>
            </div>
          </div>
        )}
      </header>
    </>
  );
};
