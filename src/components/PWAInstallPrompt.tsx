"use client";

import React, { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS
    const isIosDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !Boolean((window as unknown as { MSStream?: unknown }).MSStream);
    setIsIOS(isIosDevice);

    // Capture standard beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  if (!showPrompt && !isIOS) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm w-full p-4 rounded-xl bg-surface border border-border shadow-2xl space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent text-black flex items-center justify-center font-bold text-xs">
            PWA
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Εγκατάσταση Εφαρμογής</h4>
            <p className="text-[11px] text-secondary">NexusFit στο κινητό σας</p>
          </div>
        </div>
        <button
          onClick={() => setShowPrompt(false)}
          aria-label="Κλείσιμο"
          className="text-secondary hover:text-white p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="text-[11px] text-secondary leading-relaxed">
        {isIOS
          ? "Πατήστε 'Κοινοποίηση' και μετά 'Προσθήκη στην οθόνη αφετηρίας' στο Safari."
          : "Εγκαταστήστε την εφαρμογή για άμεση πρόσβαση στα προγράμματά σας χωρίς internet."}
      </div>

      {!isIOS && deferredPrompt && (
        <button
          onClick={handleInstallClick}
          className="w-full py-2 rounded-lg bg-accent hover:bg-accent-hover text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Εγκατάσταση Τώρα</span>
        </button>
      )}
    </div>
  );
};
