"use client";

import { useState, useEffect } from "react";

export interface NetworkStatus {
  isSlowNetwork: boolean;
  isOffline: boolean;
  effectiveType: string;
  isLiteMode: boolean;
  toggleLiteMode: () => void;
}

export function useNetworkStatus(): NetworkStatus {
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [effectiveType, setEffectiveType] = useState("4g");
  const [manualLiteMode, setManualLiteMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check saved manual preference
    const savedPref = localStorage.getItem("nexusfit_lite_mode");
    if (savedPref === "true") {
      setManualLiteMode(true);
    }

    // 2. Check online/offline status
    const updateOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();

    // 3. Network Information API detection (2G, slow 3G, or Save-Data header)
    const nav = navigator as unknown as {
      connection?: {
        effectiveType?: string;
        saveData?: boolean;
        rtt?: number;
        addEventListener?: (event: string, cb: () => void) => void;
        removeEventListener?: (event: string, cb: () => void) => void;
      };
    };

    const updateConnectionStatus = () => {
      if (nav.connection) {
        const type = nav.connection.effectiveType || "4g";
        const isSlow = type === "slow-2g" || type === "2g" || (nav.connection.rtt ? nav.connection.rtt > 1500 : false) || Boolean(nav.connection.saveData);
        setEffectiveType(type);
        setIsSlowNetwork(isSlow);
      }
    };

    if (nav.connection) {
      updateConnectionStatus();
      if (nav.connection.addEventListener) {
        nav.connection.addEventListener("change", updateConnectionStatus);
      }
    }

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      if (nav.connection?.removeEventListener) {
        nav.connection.removeEventListener("change", updateConnectionStatus);
      }
    };
  }, []);

  const toggleLiteMode = () => {
    const next = !manualLiteMode;
    setManualLiteMode(next);
    localStorage.setItem("nexusfit_lite_mode", String(next));
  };

  const isLiteMode = manualLiteMode || isSlowNetwork || isOffline;

  return {
    isSlowNetwork,
    isOffline,
    effectiveType,
    isLiteMode,
    toggleLiteMode,
  };
}
