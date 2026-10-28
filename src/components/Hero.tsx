"use client";

import React from "react";
import { useGymConfig } from "@/lib/useGymConfig";
import { MapPin, Dumbbell, Users, Clock, Award } from "lucide-react";

interface HeroProps {
  onOpenContact: () => void;
  onOpenLogin: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenContact, onOpenLogin }) => {
  const { config } = useGymConfig();

  return (
    <section className="pt-28 pb-16 border-b border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          {/* Left Column: Athletic Presentation */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-elevated border border-border text-xs font-semibold text-secondary">
              <MapPin className="w-3.5 h-3.5 text-accent" />
              <span>{config.address}, {config.city}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-primary tracking-tight leading-[1.2]">
              {config.gymName}
            </h1>

            <p className="text-secondary text-sm sm:text-base leading-relaxed max-w-xl">
              {config.description}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={onOpenContact}
                className="px-5 py-3 rounded-lg bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs tracking-tight transition-colors shadow-sm"
              >
                Επίσκεψη & Πληροφορίες
              </button>

              <button
                onClick={onOpenLogin}
                className="px-5 py-3 rounded-lg bg-surface-elevated hover:bg-border text-primary font-semibold text-xs border border-border transition-colors"
              >
                Είσοδος Μελών
              </button>
            </div>

            <div className="text-[11px] text-tertiary">
              * Οι εγγραφές και η έκδοση καρτών μέλους πραγματοποιούνται αποκλειστικά αυτοπροσώπως στη γραμματεία του γυμναστηρίου.
            </div>
          </div>

          {/* Right Column: Key Gym Highlights & Specs Card */}
          <div className="lg:col-span-5">
            <div className="bg-surface border border-border rounded-xl p-6 shadow-lg space-y-5">
              <div className="pb-3 border-b border-border">
                <span className="text-[10px] font-mono text-accent uppercase font-bold">
                  Προδιαγραφές Κέντρου
                </span>
                <h3 className="text-base font-bold text-primary mt-0.5">
                  Στοιχεία του Κέντρου
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center gap-2 text-accent">
                    <Dumbbell className="w-4 h-4" />
                    <span className="font-mono text-base font-black text-primary">{config.stats.squareMeters} τ.μ.</span>
                  </div>
                  <div className="text-[11px] text-secondary">Αίθουσες, βάρη & υπαίθριοι χώροι</div>
                </div>

                <div className="p-3.5 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center gap-2 text-accent">
                    <Users className="w-4 h-4" />
                    <span className="font-mono text-base font-black text-primary">{config.stats.weeklyClasses}+ Ώρες</span>
                  </div>
                  <div className="text-[11px] text-secondary">Ομαδικά μαθήματα εβδομαδιαίως</div>
                </div>

                <div className="p-3.5 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center gap-2 text-accent">
                    <Clock className="w-4 h-4" />
                    <span className="font-mono text-base font-black text-primary">{config.workingHours.weekdays}</span>
                  </div>
                  <div className="text-[11px] text-secondary">Δευτέρα έως Παρασκευή</div>
                </div>

                <div className="p-3.5 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center gap-2 text-accent">
                    <Award className="w-4 h-4" />
                    <span className="font-mono text-base font-black text-primary">Πιστοποιημένοι</span>
                  </div>
                  <div className="text-[11px] text-secondary">Πιστοποιημένοι Προπονητές</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-surface-elevated/60 border border-border text-xs text-secondary leading-relaxed">
                <strong className="text-primary">Παροχές Μελών: </strong>
                Πλήρης πρόσβαση στις αίθουσες, χρήση αποδυτηρίων και ερμαρίων, σάουνα και αποκλειστική πρόσβαση στον χώρο μελών.
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
