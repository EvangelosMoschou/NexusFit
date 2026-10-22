"use client";

import { useState, useEffect } from "react";
import { hasConsent } from "@/lib/consent";

export interface UTMParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export function useUTM(): UTMParams {
  const [utm, setUtm] = useState<UTMParams>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const captured: UTMParams = {};

    if (params.get("utm_source")) captured.source = params.get("utm_source") || "";
    if (params.get("utm_medium")) captured.medium = params.get("utm_medium") || "";
    if (params.get("utm_campaign")) captured.campaign = params.get("utm_campaign") || "";
    if (params.get("utm_term")) captured.term = params.get("utm_term") || "";
    if (params.get("utm_content")) captured.content = params.get("utm_content") || "";

    if (Object.keys(captured).length > 0) {
      setUtm(captured);
      // Campaign parameters are non-essential storage: only persist them once
      // the visitor has consented.
      if (hasConsent()) {
        try {
          sessionStorage.setItem("nexusfit_utm", JSON.stringify(captured));
        } catch {}
      }
    } else {
      const stored = sessionStorage.getItem("nexusfit_utm");
      if (stored) {
        try {
          setUtm(JSON.parse(stored));
        } catch {}
      }
    }
  }, []);

  return utm;
}
