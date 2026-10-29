"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, FileQuestion, Palette } from "lucide-react";
import { useEscapeKey } from "@/lib/useEscapeKey";

type ThemeId = "default" | "sand" | "volt" | "coastal";

const STORAGE_KEY = "nexusfit_theme_preview";

const THEMES: Array<{ id: ThemeId; label: string; hint: string; dots: string[] }> = [
  {
    id: "default",
    label: "Αρχικό",
    hint: "Γραφίτης & κυανό",
    dots: ["#181A20", "#38BDF8", "#F3F4F6"],
  },
  {
    id: "sand",
    label: "A · Άμμος & Πηλός",
    hint: "Φωτεινό, ζεστό",
    dots: ["#F6EFE5", "#C2410C", "#1E5C4B"],
  },
  {
    id: "volt",
    label: "B · Γραφίτης & Βολτ",
    hint: "Σκούρο, αθλητικό",
    dots: ["#0A0C0B", "#C6F83C", "#FF5A2E"],
  },
  {
    id: "coastal",
    label: "C · Θάλασσα & Κοράλλι",
    hint: "Φωτεινό, μεσογειακό",
    dots: ["#EFF7F6", "#0E6E77", "#FF6A3D"],
  },
];

function applyTheme(id: ThemeId): void {
  const root = document.documentElement;
  if (id === "default") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

interface ThemePreviewSwitcherProps {
  // The 404 preview route only exists in the Next app, not the static demo.
  showNotFoundLink?: boolean;
}

// Temporary preview control: lets the owner compare the colour proposals on
// the real site. Remove this component (and the tokens can stay) once a theme
// is chosen.
export const ThemePreviewSwitcher: React.FC<ThemePreviewSwitcherProps> = ({
  showNotFoundLink = false,
}) => {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("default");
  const containerRef = useRef<HTMLDivElement>(null);

  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}

    // `?theme=sand` lets a preview link land directly on a variant.
    const fromQuery = new URLSearchParams(window.location.search).get("theme");
    const candidate = THEMES.some((item) => item.id === fromQuery)
      ? fromQuery
      : THEMES.some((item) => item.id === stored)
        ? stored
        : "default";

    setTheme(candidate as ThemeId);
    applyTheme(candidate as ThemeId);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const selectTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
  };

  return (
    <div
      className="fixed top-16 right-4 sm:top-auto sm:bottom-24 z-[75]"
      ref={containerRef}
    >
      {open && (
        <div
          role="dialog"
          aria-label="Επιλογή θέματος"
          className="absolute right-0 top-full mt-2 sm:top-auto sm:bottom-full sm:mb-2 w-72 rounded-xl bg-surface border border-border shadow-2xl p-2"
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-xs font-bold text-primary">Θέμα εμφάνισης</div>
            <div className="text-[10px] text-tertiary mt-0.5">
              Προσωρινό preview, αποθηκεύεται σε αυτόν τον περιηγητή.
            </div>
          </div>

          <div className="p-1.5 space-y-0.5">
            {THEMES.map((item) => {
              const active = theme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTheme(item.id)}
                  aria-pressed={active}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    active ? "bg-surface-elevated" : "hover:bg-surface-elevated"
                  }`}
                >
                  <span className="flex shrink-0">
                    {item.dots.map((dot) => (
                      <span
                        key={dot}
                        className="w-3.5 h-3.5 rounded-full border border-border -ml-1 first:ml-0"
                        style={{ backgroundColor: dot }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold text-primary truncate">
                      {item.label}
                    </span>
                    <span className="block text-[10px] text-tertiary">{item.hint}</span>
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                </button>
              );
            })}
          </div>

          {showNotFoundLink && (
            <div className="border-t border-border p-1.5">
              <a
                href="/404"
                className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-[11px] font-semibold text-secondary hover:text-primary hover:bg-surface-elevated transition-colors"
              >
                <FileQuestion className="w-3.5 h-3.5 shrink-0" />
                <span>Δοκιμή σελίδας 404</span>
              </a>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Επιλογή θέματος εμφάνισης"
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-surface border border-border text-primary text-xs font-semibold shadow-lg hover:bg-surface-elevated transition-colors"
      >
        <Palette className="w-3.5 h-3.5 text-accent" />
        <span>Θέμα</span>
      </button>
    </div>
  );
};
