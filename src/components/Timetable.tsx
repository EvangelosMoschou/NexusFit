"use client";

import React, { useState } from "react";
import { useGymConfig } from "@/lib/useGymConfig";

interface TimetableProps {
  onOpenBooking: () => void;
}

export const Timetable: React.FC<TimetableProps> = ({ onOpenBooking }) => {
  const { config } = useGymConfig();
  const [selectedDay, setSelectedDay] = useState<string>("Monday");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const days = [
    { key: "Monday", greek: "Δευτέρα" },
    { key: "Tuesday", greek: "Τρίτη" },
    { key: "Wednesday", greek: "Τετάρτη" },
    { key: "Thursday", greek: "Πέμπτη" },
    { key: "Friday", greek: "Παρασκευή" },
    { key: "Saturday", greek: "Σάββατο" },
  ];

  const CATEGORY_LABELS: Record<string, string> = {
    Strength: "Δύναμη",
    HIIT: "Υψηλή Ένταση",
    Pilates: "Πιλάτες",
    Yoga: "Γιόγκα",
    Boxing: "Πυγμαχία",
    Cycling: "Ποδηλασία",
  };

  const INTENSITY_LABELS: Record<string, string> = {
    Low: "Χαμηλή",
    Medium: "Μέτρια",
    High: "Υψηλή",
  };

  const categoryLabel = (value: string) => CATEGORY_LABELS[value] ?? value;

  const categories = ["ALL", ...Array.from(new Set(config.schedule.map((item) => item.category)))];

  const filteredSchedule = config.schedule.filter((item) => {
    const matchDay = item.day === selectedDay;
    const matchCat = selectedCategory === "ALL" || item.category === selectedCategory;
    return matchDay && matchCat;
  });

  return (
    <section id="schedule" className="py-16 border-b border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-[11px] font-mono text-accent uppercase font-bold">
              Πρόγραμμα Μαθημάτων
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
              Εβδομαδιαίο Πρόγραμμα Ομαδικών
            </h2>
            <p className="text-secondary text-xs sm:text-sm mt-1">
              {config.stats.weeklyClasses}+ ώρες ομαδικών μαθημάτων εβδομαδιαίως, περιλαμβάνονται στη συνδρομή.
            </p>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? "bg-white text-black font-bold"
                    : "bg-surface text-secondary hover:text-white border border-border"
                }`}
              >
                {cat === "ALL" ? "Όλα" : categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Day Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-6">
          {days.map((d) => (
            <button
              key={d.key}
              onClick={() => setSelectedDay(d.key)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedDay === d.key
                  ? "bg-white text-black font-bold shadow-sm"
                  : "bg-surface text-secondary hover:text-white border border-border"
              }`}
            >
              {d.greek}
            </button>
          ))}
        </div>

        {/* Class Rows */}
        <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
          {filteredSchedule.length > 0 ? (
            filteredSchedule.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-elevated/60 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="font-mono text-xs font-bold text-accent min-w-[100px]">
                    {item.time}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">
                      {item.className}
                    </div>
                    <div className="text-xs text-tertiary">
                      {categoryLabel(item.category)} • Προπονητής: {item.trainer} • Διάρκεια: {item.duration}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-surface-elevated text-secondary border border-border">
                    Ένταση: {INTENSITY_LABELS[item.intensity] ?? item.intensity}
                  </span>
                  <button
                    onClick={onOpenBooking}
                    className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-white text-xs font-medium border border-border transition-colors"
                  >
                    Πληροφορίες
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-secondary">
              Δεν υπάρχουν μαθήματα για τη συγκεκριμένη κατηγορία αυτή την ημέρα.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
