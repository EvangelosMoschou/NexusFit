"use client";

import React, { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { GymConfig, GymClassSchedule } from "@/types";

interface ScheduleTabProps {
  config: GymConfig;
  setConfig: Dispatch<SetStateAction<GymConfig>>;
  selectedDay: string;
  onSelectedDayChange: (day: string) => void;
}

const WEEK_DAYS: Array<{ value: GymClassSchedule["day"]; greek: string }> = [
  { value: "Monday", greek: "Δευτέρα" },
  { value: "Tuesday", greek: "Τρίτη" },
  { value: "Wednesday", greek: "Τετάρτη" },
  { value: "Thursday", greek: "Πέμπτη" },
  { value: "Friday", greek: "Παρασκευή" },
  { value: "Saturday", greek: "Σάββατο" },
  { value: "Sunday", greek: "Κυριακή" },
];

// TAB 4: SCHEDULE / TIMETABLE EDITOR
export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  config,
  setConfig,
  selectedDay,
  onSelectedDayChange,
}) => {
  const updateClass = (id: string, patch: Partial<GymClassSchedule>) => {
    setConfig((prev) => ({
      ...prev,
      schedule: prev.schedule.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const addClass = () => {
    const day = WEEK_DAYS.find((d) => d.value === selectedDay) || WEEK_DAYS[0];
    const newClass: GymClassSchedule = {
      id: `sch-${Date.now()}`,
      day: day.value,
      dayGreek: day.greek,
      time: "18:00 - 19:00",
      className: "Νέο Ομαδικό Μάθημα",
      category: "Strength",
      trainer: "Προπονητής",
      intensity: "High",
      duration: "60 λεπτά",
    };
    setConfig((prev) => ({ ...prev, schedule: [...prev.schedule, newClass] }));
  };

  const removeClass = (id: string) => {
    setConfig((prev) => ({ ...prev, schedule: prev.schedule.filter((s) => s.id !== id) }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white">Εβδομαδιαίο Ωρολόγιο Πρόγραμμα</h2>
          <p className="text-xs text-secondary">Προσθέστε ή τροποποιήστε ομαδικά μαθήματα, ώρες και προπονητές.</p>
        </div>

        <button
          type="button"
          onClick={addClass}
          className="px-3.5 py-2 rounded bg-accent hover:bg-accent-hover text-black font-bold text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Προσθήκη Μαθήματος</span>
        </button>
      </div>

      {/* Days Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {WEEK_DAYS.map((d) => (
          <button
            key={d.value}
            onClick={() => onSelectedDayChange(d.value)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              selectedDay === d.value ? "bg-white text-black font-bold" : "bg-surface text-secondary hover:text-white border border-border"
            }`}
          >
            {d.greek}
          </button>
        ))}
      </div>

      {/* Classes for Selected Day */}
      <div className="space-y-3">
        {config.schedule.filter((s) => s.day === selectedDay).map((item) => (
          <div key={item.id} className="p-4 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 flex-1">
              <div>
                <label className="block text-[10px] text-tertiary mb-0.5">Ώρα</label>
                <input
                  type="text"
                  value={item.time}
                  onChange={(e) => updateClass(item.id, { time: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-background border border-border text-white text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-tertiary mb-0.5">Όνομα Μαθήματος</label>
                <input
                  type="text"
                  value={item.className}
                  onChange={(e) => updateClass(item.id, { className: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-background border border-border text-white text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-tertiary mb-0.5">Κατηγορία</label>
                <select
                  value={item.category}
                  onChange={(e) => updateClass(item.id, { category: e.target.value as GymClassSchedule["category"] })}
                  className="w-full px-2 py-1 rounded bg-background border border-border text-white text-xs"
                >
                  <option value="Strength">Δύναμη</option>
                  <option value="HIIT">Υψηλή Ένταση</option>
                  <option value="Pilates">Πιλάτες</option>
                  <option value="Yoga">Γιόγκα</option>
                  <option value="Boxing">Πυγμαχία</option>
                  <option value="Cycling">Ποδηλασία</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-tertiary mb-0.5">Προπονητής</label>
                <input
                  type="text"
                  value={item.trainer}
                  onChange={(e) => updateClass(item.id, { trainer: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-background border border-border text-white text-xs"
                />
              </div>
            </div>

            <button
              onClick={() => removeClass(item.id)}
              aria-label="Διαγραφή μαθήματος"
              className="p-2 rounded text-secondary hover:text-red-400 transition-colors shrink-0"
              title="Διαγραφή μαθήματος"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
