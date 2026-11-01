"use client";

import React, { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Lock, QrCode, ShieldCheck } from "lucide-react";

interface AccessTokenData {
  token: string;
  expiresAt: string;
  memberCode: string;
}

export const AccessPass: React.FC = () => {
  const [data, setData] = useState<AccessTokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/member/access-token", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) {
        setData({
          token: json.token,
          expiresAt: json.expiresAt,
          memberCode: json.memberCode,
        });
        setError(null);
      } else {
        setData(null);
        setError(json.error || "Το QR πρόσβασης δεν είναι διαθέσιμο.");
      }
    } catch {
      setError("Σφάλμα φόρτωσης του QR πρόσβασης.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 45_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="p-5 rounded-xl bg-surface border border-border space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-accent" />
        <h3 className="text-xs font-bold text-primary">QR Πρόσβασης</h3>
      </div>

      {loading ? (
        <div className="h-40 rounded-lg bg-background border border-border flex items-center justify-center text-[11px] text-secondary">
          Φόρτωση QR...
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-background border border-border flex items-start gap-2 text-[11px] text-secondary">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : data ? (
        <>
          <div
            className="bg-white rounded-lg p-3 w-fit mx-auto"
            role="img"
            aria-label="QR πρόσβασης γυμναστηρίου"
          >
            <QRCodeSVG
              value={data.token}
              size={172}
              level="M"
              bgColor="#ffffff"
              fgColor="#0f172a"
            />
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono text-tertiary">
              {data.memberCode}
            </div>
            <p className="text-[10px] text-tertiary mt-1 leading-relaxed">
              Σάρωσε το QR στην είσοδο. Ανανεώνεται αυτόματα για ασφάλεια.
            </p>
          </div>
        </>
      ) : (
        <div className="p-4 rounded-lg bg-background border border-border text-[11px] text-secondary flex items-center gap-2">
          <QrCode className="w-4 h-4 text-tertiary" />
          Δεν υπάρχει διαθέσιμο QR.
        </div>
      )}
    </div>
  );
};
