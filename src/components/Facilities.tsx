import React from "react";
import { useGymConfig } from "@/lib/useGymConfig";
import { Dumbbell, Flame, Zap, Sparkles } from "lucide-react";

export const Facilities: React.FC = () => {
  const { config } = useGymConfig();
  const iconMap: Record<string, React.ElementType> = {
    Dumbbell: Dumbbell,
    Flame: Flame,
    Zap: Zap,
    Sparkles: Sparkles,
  };

  return (
    <section id="facilities" className="py-16 border-b border-border bg-surface/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-10">
          <span className="text-[11px] font-mono text-accent uppercase font-bold">
            Equipment & Spaces
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
            Εγκαταστάσεις & Ζώνες Προπόνησης
          </h2>
          <p className="text-secondary text-xs sm:text-sm mt-1">
            Προσεκτικά σχεδιασμένοι χώροι για μέγιστη άνεση, ασφάλεια και απόδοση.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config.facilities.map((fac) => {
            const IconComp = iconMap[fac.iconName] || Dumbbell;
            return (
              <div
                key={fac.id}
                className="p-5 rounded-xl bg-surface border border-border space-y-2.5 hover:border-border-light transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-surface-elevated text-accent">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono uppercase text-tertiary">
                    {fac.subtitle}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white">
                  {fac.title}
                </h3>

                <p className="text-secondary text-xs leading-relaxed">
                  {fac.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
