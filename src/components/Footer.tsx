"use client";

import React from "react";
import { useGymConfig } from "@/lib/useGymConfig";
import { clearConsent } from "@/lib/consent";

interface FooterProps {
  onOpenLegal: (type: "tos" | "privacy") => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => {
  const { config } = useGymConfig();

  return (
    <footer className="bg-background border-t border-border py-12 text-secondary text-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Col 1 */}
          <div className="space-y-2">
            <div className="font-bold text-sm text-white uppercase">
              {config.gymName}
            </div>
            <p className="text-tertiary text-xs leading-relaxed">
              {config.tagline}
            </p>
            <div className="text-[11px] text-tertiary">
              {config.legalName}
            </div>
          </div>

          {/* Col 2 */}
          <div className="space-y-2">
            <div className="font-semibold text-white">Πλοήγηση</div>
            <ul className="space-y-1.5 text-secondary">
              <li><a href="#facilities" className="hover:text-white transition-colors">Εγκαταστάσεις</a></li>
              <li><a href="#schedule" className="hover:text-white transition-colors">Πρόγραμμα Ομαδικών</a></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Συνδρομές & AI Add-on</a></li>
              <li><a href="#contact" className="hover:text-white transition-colors">Online Εγγραφή</a></li>
            </ul>
          </div>

          {/* Col 3 */}
          <div className="space-y-2">
            <div className="font-semibold text-white">Ωράριο & Τοποθεσία</div>
            <div className="space-y-1 text-tertiary">
              <div>Δευτέρα - Παρασκευή: {config.workingHours.weekdays}</div>
              <div>Σάββατο: {config.workingHours.saturday}</div>
              <div>Κυριακή: {config.workingHours.sunday}</div>
              <div className="pt-1 text-secondary">{config.address}</div>
            </div>
          </div>

          {/* Col 4 */}
          <div className="space-y-2">
            <div className="font-semibold text-white">Νομικά & Επικοινωνία</div>
            <ul className="space-y-1.5 text-secondary">
              <li>
                <button
                  onClick={() => onOpenLegal("tos")}
                  className="hover:text-white transition-colors text-left"
                >
                  Όροι Χρήσης (TOS)
                </button>
              </li>
              <li>
                <button
                  onClick={() => onOpenLegal("privacy")}
                  className="hover:text-white transition-colors text-left"
                >
                  Πολιτική Απορρήτου (Privacy Policy)
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    // Withdrawing consent makes the banner reappear on reload.
                    clearConsent();
                    window.location.reload();
                  }}
                  className="hover:text-white transition-colors text-left"
                >
                  Διαχείριση Cookies
                </button>
              </li>
              <li>
                <a href={`mailto:${config.email}`} className="hover:text-white transition-colors">
                  {config.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-tertiary">
          <div>
            © {new Date().getFullYear()} {config.legalName}. All rights reserved.
          </div>
          <div>
            NexusFit Architecture
          </div>
        </div>
      </div>
    </footer>
  );
};
