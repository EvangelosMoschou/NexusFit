"use client";

import React, { useEffect, useRef, useState } from "react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { MemberUser } from "@/lib/auth";
import { CalendarDays, ChevronDown, Dumbbell, LineChart, LogOut, User } from "lucide-react";

export type PortalTab = "overview" | "plans" | "logs" | "schedule";

interface MemberMenuProps {
  member: MemberUser;
  onSelectTab: (tab: PortalTab) => void;
  onLogout: () => void;
}

const MENU_ITEMS: Array<{ tab: PortalTab; label: string; icon: typeof User }> = [
  { tab: "overview", label: "Ο λογαριασμός μου", icon: User },
  { tab: "plans", label: "Τα προγράμματά μου", icon: Dumbbell },
  { tab: "logs", label: "Καταγραφές βάρους", icon: LineChart },
  { tab: "schedule", label: "Σημερινά μαθήματα", icon: CalendarDays },
];

function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const second = words.length > 1 ? words[1][0] : "";
  return (first + second).toUpperCase();
}

// Compact account menu shown in the site header while a member is signed in.
// It replaces the separate member screen as the entry point to the portal.
export const MemberMenu: React.FC<MemberMenuProps> = ({ member, onSelectTab, onLogout }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const handleSelect = (tab: PortalTab) => {
    setOpen(false);
    onSelectTab(tab);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Μενού μέλους"
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 border border-border bg-surface-elevated hover:bg-border transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-accent text-accent-ink text-[11px] font-extrabold flex items-center justify-center">
          {initials(member.fullName)}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-secondary transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Μενού μέλους"
          className="absolute right-0 mt-2 w-64 rounded-xl bg-surface border border-border shadow-2xl overflow-hidden z-[60]"
        >
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs font-bold text-primary truncate">{member.fullName}</div>
            <div className="text-[11px] text-tertiary font-mono mt-0.5">
              {member.memberCode}
            </div>
          </div>

          <div className="p-1.5">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  role="menuitem"
                  type="button"
                  onClick={() => handleSelect(item.tab)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-surface-elevated transition-colors text-left"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-border p-1.5">
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-secondary hover:text-primary hover:bg-surface-elevated transition-colors text-left"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Αποσύνδεση</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
