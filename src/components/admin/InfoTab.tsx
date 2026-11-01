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
          <label className="block text-[11px] text-secondary mb-1">Τηλέφωνο</label>
          <input
            type="tel"
            value={config.phone ?? ""}
            onChange={(e) => setField("phone", e.target.value)}
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">
            Διεύθυνση (οδός & αριθμός)
          </label>
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
          <label className="block text-[11px] text-secondary mb-1">Γεωγραφικό πλάτος</label>
          <input
            type="number"
            step="0.000001"
            value={config.latitude ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              const parsed = Number(value);
              setField(
                "latitude",
                value === "" || !Number.isFinite(parsed) ? undefined : parsed
              );
            }}
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs font-mono"
          />
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">Γεωγραφικό μήκος</label>
          <input
            type="number"
            step="0.000001"
            value={config.longitude ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              const parsed = Number(value);
              setField(
                "longitude",
                value === "" || !Number.isFinite(parsed) ? undefined : parsed
              );
            }}
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs font-mono"
          />
        </div>

        <div className="sm:col-span-2">
          <p className="text-[10px] text-tertiary leading-relaxed">
            Οι συντεταγμένες τροφοδοτούν τον χάρτη της αρχικής σελίδας. Για τον
            Λευκό Πύργο Θεσσαλονίκης: <span className="font-mono">40.62630, 22.94850</span>.
          </p>
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">
            Cooldown επανεισόδου (λεπτά)
          </label>
          <input
            type="number"
            min={0}
            max={120}
            value={config.reentryCooldownMinutes}
            onChange={(e) =>
              setField(
                "reentryCooldownMinutes",
                Math.max(0, Number(e.target.value) || 0)
              )
            }
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
          <p className="text-[10px] text-tertiary mt-1 leading-relaxed">
            Default 0 = απενεργοποιημένο. Όταν είναι 0, οι γρήγορες
            έξοδοι/επανείσοδοι επιτρέπονται αλλά καταγράφονται και
            ενεργοποιούν alarm αν ξεπεράσουν το όριο της εβδομάδας.
          </p>
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

        <div>
          <label className="block text-[11px] text-secondary mb-1">
            Χωρητικότητα (άτομα)
          </label>
          <input
            type="number"
            min={1}
            max={1000}
            value={config.capacity}
            onChange={(e) => setField("capacity", Math.max(0, Number(e.target.value) || 0))}
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
        </div>

        <div>
          <label className="block text-[11px] text-secondary mb-1">
            Αυτόματο τέλος παρουσίας (λεπτά αδράνειας)
          </label>
          <input
            type="number"
            min={0}
            max={480}
            value={config.idleCheckoutMinutes}
            onChange={(e) =>
              setField("idleCheckoutMinutes", Math.max(0, Number(e.target.value) || 0))
            }
            className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs"
          />
          <p className="text-[10px] text-tertiary mt-1 leading-relaxed">
            0 = απενεργοποιημένο. Μεγαλύτερη τιμή = λιγότερα λάθος check-out όταν
            κάποιος προπονείται χωρίς το κινητό.
          </p>
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
