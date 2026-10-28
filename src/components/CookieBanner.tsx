"use client";

import React, { useState, useEffect } from "react";
import { hasValidConsent, writeConsent } from "@/lib/consent";

interface CookieBannerProps {
  onOpenPrivacy: () => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onOpenPrivacy }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show the banner until a consent record valid for the current policy
    // version exists.
    if (!hasValidConsent()) {
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    writeConsent("accepted");
    setIsVisible(false);
  };

  const handleDecline = () => {
    writeConsent("essential_only");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-40">
      <div className="bg-surface border border-border p-4 rounded-lg shadow-2xl space-y-3">
        <div className="text-xs text-secondary leading-relaxed">
          Χρησιμοποιούμε απαραίτητα αρχεία καταγραφής για τη βελτιστοποίηση της πλοήγησης και την ασφαλή λειτουργία των υπηρεσιών μας. Διαβάστε την{" "}
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="text-white underline hover:text-accent"
          >
            Πολιτική Απορρήτου
          </button>
          .
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAccept}
            className="flex-1 py-1.5 px-3 rounded bg-white hover:bg-white/90 text-black font-bold text-xs transition-colors"
          >
            Αποδοχή Όλων
          </button>
          <button
            onClick={handleDecline}
            className="py-1.5 px-3 rounded bg-surface-elevated hover:bg-border text-secondary hover:text-white text-xs font-medium transition-colors"
          >
            Μόνο Απαραίτητα
          </button>
        </div>
      </div>
    </div>
  );
};
