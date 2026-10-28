"use client";

import React, { Dispatch, SetStateAction } from "react";
import { GymConfig } from "@/types";

interface InfoTabProps {
  config: GymConfig;
  setConfig: Dispatch<SetStateAction<GymConfig>>;
}

// TAB 5: GENERAL INFO & FACILITIES
export const InfoTab: React.FC<InfoTabProps> = ({ config, setConfig }) => {
  const setField = <K extends keyof GymConfig>(key: K, value: GymConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
      <div>
        <h2 className="text-base font-bold text-primary">Στοιχεία & Ταυτότητα Γυμναστηρίου</h2>
        <p className="text-xs text-secondary">Βασικές πληροφορίες επικοινωνίας και ωραρίου.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-[11px] text-secondary mb-1">Όνομα Γυμναστηρίου</label>
          <input
            type="text"
            value={config.gymName}
            onChange={(e) => setField("gymName", e.target.value)}
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs font-bold"
          />
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">Ηλεκτρονικό Ταχυδρομείο</label>
          <input
            type="email"
            value={config.email}
            onChange={(e) => setField("email", e.target.value)}
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">Διεύθυνση</label>
          <input
            type="text"
            value={config.address}
            onChange={(e) => setField("address", e.target.value)}
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">Πόλη</label>
          <input
            type="text"
            value={config.city}
            onChange={(e) => setField("city", e.target.value)}
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">Ωράριο Καθημερινών</label>
          <input
            type="text"
            value={config.workingHours.weekdays}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                workingHours: { ...prev.workingHours, weekdays: e.target.value },
              }))
            }
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">Ωράριο Σαββατοκύριακου</label>
          <input
            type="text"
            value={config.workingHours.saturday}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                workingHours: { ...prev.workingHours, saturday: e.target.value },
              }))
            }
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] text-secondary mb-1">Περιγραφή Γυμναστηρίου</label>
        <textarea
          rows={3}
          value={config.description}
          onChange={(e) => setField("description", e.target.value)}
          className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
        />
      </div>
    </div>
  );
};
