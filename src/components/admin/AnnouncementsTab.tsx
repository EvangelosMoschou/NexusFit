"use client";

import React, { Dispatch, SetStateAction } from "react";
import { GymAnnouncement, GymConfig } from "@/types";
import { Megaphone, Plus, Trash2 } from "lucide-react";

interface AnnouncementsTabProps {
  config: GymConfig;
  setConfig: Dispatch<SetStateAction<GymConfig>>;
}

// TAB: GYM ANNOUNCEMENTS
export const AnnouncementsTab: React.FC<AnnouncementsTabProps> = ({ config, setConfig }) => {
  const announcements = config.announcements ?? [];

  const setAnnouncements = (items: GymAnnouncement[]) => {
    setConfig((prev) => ({ ...prev, announcements: items }));
  };

  const updateAnnouncement = (id: string, patch: Partial<GymAnnouncement>) => {
    setAnnouncements(announcements.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addAnnouncement = () => {
    const today = new Date().toISOString().split("T")[0];
    setAnnouncements([
      {
        id: `ann-${Date.now()}`,
        title: "Νέα ανακοίνωση",
        body: "",
        level: "info",
        date: today,
      },
      ...announcements,
    ]);
  };

  const removeAnnouncement = (id: string) => {
    setAnnouncements(announcements.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-accent" />
            Ανακοινώσεις Γυμναστηρίου
          </h2>
          <p className="text-xs text-secondary mt-1">
            Εμφανίζονται στην αρχική σελίδα. Χρήσιμες για ακυρώσεις μαθημάτων, αλλαγές ωραρίου ή
            έκτακτο κλείσιμο.
          </p>
        </div>

        <button
          type="button"
          onClick={addAnnouncement}
          className="px-3.5 py-2 rounded-lg bg-white hover:bg-white/90 text-black font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Νέα Ανακοίνωση
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className="p-6 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
          Δεν υπάρχουν ανακοινώσεις. Η ενότητα δεν εμφανίζεται στην ιστοσελίδα.
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((item) => (
            <div key={item.id} className="p-5 rounded-xl bg-surface border border-border space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                <div className="sm:col-span-7">
                  <label className="block text-[11px] text-secondary mb-1">Τίτλος</label>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateAnnouncement(item.id, { title: e.target.value })}
                    placeholder="π.χ. Δεν θα γίνουν σήμερα τα μαθήματα γιόγκα"
                    className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs font-bold outline-none focus:border-border-light"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-secondary mb-1">Ημερομηνία</label>
                  <input
                    type="date"
                    value={item.date ?? ""}
                    onChange={(e) => updateAnnouncement(item.id, { date: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs font-mono outline-none focus:border-border-light"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-secondary mb-1">Τύπος</label>
                  <select
                    value={item.level}
                    onChange={(e) =>
                      updateAnnouncement(item.id, {
                        level: e.target.value as GymAnnouncement["level"],
                      })
                    }
                    className="w-full px-2 py-2 rounded bg-background border border-border text-white text-xs"
                  >
                    <option value="info">Ενημέρωση</option>
                    <option value="warning">Προσοχή</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-secondary mb-1">Κείμενο</label>
                <textarea
                  rows={3}
                  value={item.body}
                  onChange={(e) => updateAnnouncement(item.id, { body: e.target.value })}
                  placeholder="Γράψτε την ανακοίνωση που θα δουν τα μέλη και οι επισκέπτες."
                  className="w-full px-3 py-2 rounded bg-background border border-border text-white text-xs outline-none focus:border-border-light resize-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeAnnouncement(item.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-red-400 text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Διαγραφή
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-tertiary">
        Οι αλλαγές αποθηκεύονται με το κουμπί «Αποθήκευση Αλλαγών» πάνω δεξιά.
      </p>
    </div>
  );
};
