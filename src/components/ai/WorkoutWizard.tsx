"use client";

import React, { useState } from "react";
import { 
  WorkoutGoal, 
  ExperienceLevel, 
  UserPreferences, 
  GeneratedWorkoutPlan 
} from "@/types";
import { generateSmartWorkoutPlan } from "@/lib/aiWorkoutEngine";
import { X } from "lucide-react";
import { useEscapeKey } from "@/lib/useEscapeKey";

interface WorkoutWizardProps {
  onPlanGenerated: (plan: GeneratedWorkoutPlan) => void;
  onClose: () => void;
}

export const WorkoutWizard: React.FC<WorkoutWizardProps> = ({ onPlanGenerated, onClose }) => {
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);

  const [preferences, setPreferences] = useState<UserPreferences>({
    name: "",
    gender: "male",
    goal: "hypertrophy",
    experience: "intermediate",
    daysPerWeek: 4,
    durationMinutes: 60,
    injuries: ["none"],
    equipmentAccess: "full_gym",
  });

  useEscapeKey(true, onClose);

  const goals: { id: WorkoutGoal; title: string; desc: string }[] = [
    {
      id: "hypertrophy",
      title: "Μυϊκή Μάζα & Υπερτροφία",
      desc: "Στοχευμένος όγκος προπόνησης, 8-12 επαναλήψεις και μυϊκό σχήμα.",
    },
    {
      id: "fat_loss",
      title: "Απώλεια Λίπους & Γράμμωση",
      desc: "Υψηλή πυκνότητα άσκησης, 12-15 επαναλήψεις και μικρότερα διαλείμματα.",
    },
    {
      id: "strength",
      title: "Απόλυτη Δύναμη",
      desc: "Εστίαση σε βασικές ασκήσεις (κάθισμα, πιέσεις πάγκου, κωπηλατική) και εύρος 4-6 επαναλήψεων.",
    },
    {
      id: "general_fit",
      title: "Γενική Φυσική Κατάσταση",
      desc: "Ισορροπημένη ενδυνάμωση κορμού, κινητικότητα και καρδιαγγειακή υγεία.",
    },
  ];

  const experienceLevels: { id: ExperienceLevel; title: string; subtitle: string }[] = [
    { id: "beginner", title: "Αρχάριος (< 1 έτος)", subtitle: "Εκμάθηση βασικών μοτίβων κίνησης" },
    { id: "intermediate", title: "Μέσος (1 - 3 έτη)", subtitle: "Σταθερή εμπειρία και σταδιακή αύξηση επιβάρυνσης" },
    { id: "advanced", title: "Προχωρημένος (3+ έτη)", subtitle: "Υψηλή ένταση και σύνθετα προγράμματα" },
  ];

  const injuryOptions = [
    { id: "none", label: "Κανένας περιορισμός (Πλήρες ασκησιολόγιο)" },
    { id: "lower_back", label: "Ευαισθησία στη μέση (Αποκλεισμός βαρέων άρσεων και καθισμάτων)" },
    { id: "shoulders", label: "Ενόχληση σε ώμους / στροφικό πέταλο" },
    { id: "knees", label: "Ενόχληση στα γόνατα" },
    { id: "wrist", label: "Ευαισθησία στους καρπούς" },
  ];

  const toggleInjury = (id: string) => {
    if (id === "none") {
      setPreferences({ ...preferences, injuries: ["none"] });
      return;
    }
    let newInjuries = preferences.injuries.filter((i) => i !== "none");
    if (newInjuries.includes(id)) {
      newInjuries = newInjuries.filter((i) => i !== id);
      if (newInjuries.length === 0) newInjuries = ["none"];
    } else {
      newInjuries.push(id);
    }
    setPreferences({ ...preferences, injuries: newInjuries });
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const plan = generateSmartWorkoutPlan(preferences);
      setIsGenerating(false);
      onPlanGenerated(plan);
    }, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Οδηγός δημιουργίας προγράμματος με ψηφιακό προπονητή"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="relative w-full max-w-2xl bg-surface border border-border p-6 sm:p-8 rounded-xl shadow-2xl space-y-6">
        
        {/* Fixed Header Layout (Zero Overlap) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-accent uppercase tracking-wider">
              ΜΗΧΑΝΗ ΠΡΟΓΡΑΜΜΑΤΩΝ NEXUSFIT
            </span>
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono text-secondary bg-surface-elevated px-2.5 py-1 rounded border border-border">
                Βήμα {step} / 4
              </span>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-secondary hover:text-white hover:bg-surface-elevated transition-colors border border-border"
                aria-label="Κλείσιμο"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="w-full h-1.5 bg-surface-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-200 rounded-full"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Skeleton Loader during Generation */}
        {isGenerating ? (
          <div className="py-8 space-y-4">
            <div className="text-center text-xs font-mono text-secondary mb-4">
              Υπολογισμός μυϊκού όγκου και προσαρμογή ασκήσεων...
            </div>
            <div className="h-6 w-2/3 skeleton-box rounded-md mx-auto" />
            <div className="h-4 w-1/2 skeleton-box rounded-md mx-auto" />
            <div className="space-y-2.5 pt-4">
              <div className="h-12 skeleton-box rounded-md" />
              <div className="h-12 skeleton-box rounded-md" />
              <div className="h-12 skeleton-box rounded-md" />
            </div>
          </div>
        ) : (
          <>
            {/* STEP 1: GOAL */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Επιλέξτε τον κύριο προπονητικό σας στόχο
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    Καθορίζει το εύρος επαναλήψεων, την επιλογή ασκήσεων και τα διαλείμματα.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {goals.map((g) => {
                    const selected = preferences.goal === g.id;
                    return (
                      <div
                        key={g.id}
                        onClick={() => setPreferences({ ...preferences, goal: g.id })}
                        className={`p-3.5 rounded-lg border cursor-pointer transition-colors ${
                          selected
                            ? "bg-surface-elevated border-accent text-white"
                            : "bg-background border-border text-secondary hover:text-white hover:border-border-light"
                        }`}
                      >
                        <div className="font-bold text-xs text-white mb-1">{g.title}</div>
                        <div className="text-[11px] text-tertiary leading-relaxed">{g.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 2: EXPERIENCE & FREQUENCY */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Επίπεδο εμπειρίας και διαθέσιμες ημέρες
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    Προσδιορίζει τη δομή του split (Full Body, Upper/Lower, Push-Pull-Legs).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-secondary">Επίπεδο:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {experienceLevels.map((exp) => (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => setPreferences({ ...preferences, experience: exp.id })}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          preferences.experience === exp.id
                            ? "bg-surface-elevated border-accent text-white"
                            : "bg-background border-border text-secondary hover:text-white"
                        }`}
                      >
                        <div className="text-xs font-bold text-white">{exp.title}</div>
                        <div className="text-[10px] text-tertiary">{exp.subtitle}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-secondary">Ημέρες ανά εβδομάδα:</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 4, 5, 6].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setPreferences({ ...preferences, daysPerWeek: days })}
                        className={`py-2 rounded-lg border text-xs font-mono font-bold transition-colors ${
                          preferences.daysPerWeek === days
                            ? "bg-white text-black font-bold border-white"
                            : "bg-background border-border text-secondary hover:text-white"
                        }`}
                      >
                        {days} Ημέρες
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: INJURIES */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Περιορισμοί & τραυματισμοί
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    Το σύστημα θα αποκλείσει αυτόματα επικίνδυνες επιβαρύνσεις και θα προτείνει ασφαλείς εναλλακτικές.
                  </p>
                </div>

                <div className="space-y-2">
                  {injuryOptions.map((inj) => {
                    const isSelected = preferences.injuries.includes(inj.id);
                    return (
                      <div
                        key={inj.id}
                        onClick={() => toggleInjury(inj.id)}
                        className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          isSelected
                            ? "bg-surface-elevated border-accent text-white"
                            : "bg-background border-border text-secondary hover:text-white"
                        }`}
                      >
                        <span>{inj.label}</span>
                        <span className="font-mono text-[10px] uppercase font-bold text-accent">
                          {isSelected ? "Επιλεγμενο" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 4: DURATION */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Διάρκεια ανά προπόνηση
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    Προσαρμόζει τον αριθμό των ασκήσεων και τα διαλείμματα ανά σετ.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { mins: 45, label: "45 λεπτά", desc: "Express / Υψηλή πυκνότητα" },
                    { mins: 60, label: "60 λεπτά", desc: "Standard ισορροπία" },
                    { mins: 90, label: "90 λεπτά", desc: "Πλήρης όγκος προπόνησης" },
                  ].map((dur) => (
                    <button
                      key={dur.mins}
                      type="button"
                      onClick={() => setPreferences({ ...preferences, durationMinutes: dur.mins })}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        preferences.durationMinutes === dur.mins
                          ? "bg-surface-elevated border-accent text-white"
                          : "bg-background border-border text-secondary hover:text-white"
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{dur.label}</div>
                      <div className="text-[10px] text-tertiary">{dur.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-6 border-t border-border">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="px-3.5 py-1.5 rounded-lg bg-surface-elevated text-xs font-medium text-secondary hover:text-white transition-colors"
                >
                  Προηγούμενο
                </button>
              ) : <div />}

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="px-4 py-2 rounded-lg bg-white text-black font-bold text-xs hover:bg-white/90 transition-colors shadow-sm"
                >
                  Επόμενο
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-black font-bold text-xs transition-colors shadow-sm"
                >
                  Παραγωγή Προγράμματος
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
