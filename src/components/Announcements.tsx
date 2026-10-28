"use client";

import React from "react";
import { useGymConfig } from "@/lib/useGymConfig";
import { AlertTriangle, Info, Megaphone } from "lucide-react";

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export const Announcements: React.FC = () => {
  const { config } = useGymConfig();
  const announcements = config.announcements ?? [];

  if (announcements.length === 0) return null;

  return (
    <section id="announcements" className="py-12 border-b border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-2 mb-5">
          <Megaphone className="w-4 h-4 text-accent" />
          <h2 className="text-lg font-bold text-white tracking-tight">
            Ανακοινώσεις Γυμναστηρίου
          </h2>
        </div>

        <div className="grid gap-3">
          {announcements.map((item) => {
            const isWarning = item.level === "warning";
            const Icon = isWarning ? AlertTriangle : Info;

            return (
              <article
                key={item.id}
                className={`p-4 rounded-xl border ${
                  isWarning
                    ? "bg-amber-950/30 border-amber-800/60"
                    : "bg-surface border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      isWarning ? "text-amber-400" : "text-accent"
                    }`}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{item.title}</h3>
                      {item.date && (
                        <span className="text-[10px] font-mono text-tertiary">
                          {formatDate(item.date)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary leading-relaxed mt-1 whitespace-pre-line">
                      {item.body}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
