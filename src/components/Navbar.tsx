"use client";

import React, { useState } from "react";
import { useGymConfig } from "@/lib/useGymConfig";
import { Menu, X, Search, LogIn, Dumbbell } from "lucide-react";

interface NavbarProps {
  onOpenContact: () => void;
  onOpenSearch: () => void;
  onOpenLogin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenContact,
  onOpenSearch,
  onOpenLogin,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { config } = useGymConfig();

  const publicNavLinks = [
    { label: "Εγκαταστάσεις", href: "#facilities" },
    { label: "Πρόγραμμα", href: "#schedule" },
    { label: "Συνδρομές", href: "#pricing" },
    { label: "Επικοινωνία", href: "#contact" },
  ];

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 z-[70] px-4 py-2 bg-white text-black text-xs font-bold rounded-lg shadow-lg"
      >
        Μετάβαση στο περιεχόμενο
      </a>

      <header className="fixed top-0 left-0 right-0 z-50 bg-[#181A20]/95 border-b border-border py-3.5 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          {/* Brand Logo */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label={`${config.gymName} - Επιστροφή στην αρχή`}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-lg bg-accent text-black font-extrabold flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition-transform">
              <Dumbbell className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="font-bold text-base tracking-tight text-white uppercase">
              {config.gymName}
            </span>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {publicNavLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-xs font-semibold text-secondary hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-2.5">
            <button
              onClick={onOpenSearch}
              aria-label="Αναζήτηση"
              className="p-2 rounded-lg bg-surface border border-border text-secondary hover:text-white hover:bg-surface-elevated transition-colors flex items-center gap-1.5 text-xs"
              title="Αναζήτηση"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onOpenLogin}
              className="px-3.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-white text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-accent" />
              <span>Σύνδεση Μέλους</span>
            </button>

            <button
              onClick={onOpenContact}
              className="px-4 py-2 rounded-lg bg-white hover:bg-white/90 text-black font-bold text-xs tracking-tight transition-colors shadow-sm"
            >
              Επικοινωνία & Επίσκεψη
            </button>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={onOpenLogin}
              className="px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border text-xs font-bold text-white"
            >
              Login
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg border border-border text-white"
              aria-label="Open menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-surface border-b border-border px-5 py-4 space-y-3">
            {publicNavLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-sm font-medium text-secondary hover:text-white border-b border-border/40"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 space-y-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenLogin();
                }}
                className="w-full py-2.5 rounded-lg bg-surface-elevated border border-border text-white font-bold text-xs text-center"
              >
                Σύνδεση Μέλους (Member Login)
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenContact();
                }}
                className="w-full py-2.5 rounded-lg bg-white text-black font-bold text-xs text-center"
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
