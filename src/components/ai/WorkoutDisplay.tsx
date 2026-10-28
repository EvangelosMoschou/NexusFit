"use client";

import React, { useState, useEffect } from "react";
import { GeneratedWorkoutPlan } from "@/types";
import { X, Printer, Copy, Check } from "lucide-react";
import { ExerciseLog, saveWorkoutToDevice, getExerciseLogs } from "@/lib/storage";
import { WeightLoggerInput } from "@/components/WeightLoggerInput";
import { useEscapeKey } from "@/lib/useEscapeKey";

// Greek labels for the stored experience levels, so the plan states which
// experience tier it was tailored for.
const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Αρχάριος",
  intermediate: "Μέσος",
  advanced: "Προχωρημένος",
};

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Μυϊκή Μάζα",
  strength: "Δύναμη",
  fat_loss: "Απώλεια Λίπους",
  endurance: "Αντοχή",
  general_fit: "Γενική Φυσική Κατάσταση",
};

interface WorkoutDisplayProps {
  plan: GeneratedWorkoutPlan;
  onReset: () => void;
  onOpenBooking: () => void;
}

export const WorkoutDisplay: React.FC<WorkoutDisplayProps> = ({ plan, onReset, onOpenBooking }) => {
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [exerciseWeights, setExerciseWeights] = useState<Record<string, string>>({});
  const [logRefreshTick, setLogRefreshTick] = useState(0);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>(() => getExerciseLogs());
  const [savedLocally, setSavedLocally] = useState(true);

  useEffect(() => {
    setExerciseLogs(getExerciseLogs());
  }, [logRefreshTick]);

  // Automatically save plan to device storage on load. Persisting requires
  // consent, so the badge reflects what actually happened.
  useEffect(() => {
    setSavedLocally(saveWorkoutToDevice(plan));
  }, [plan]);

  useEscapeKey(true, onReset);

  const activeDay = plan.days[activeDayIdx] || plan.days[0];

  const handleCopy = () => {
    let text = `ΠΡΟΓΡΑΜΜΑ ΠΡΟΠΟΝΗΣΗΣ NEXUSFIT: ${plan.splitName}\n`;
    text += `Στόχος: ${GOAL_LABELS[plan.userGoal] ?? plan.userGoal} | Επίπεδο: ${EXPERIENCE_LABELS[plan.experienceLevel] ?? plan.experienceLevel} | ${plan.daysPerWeek} Ημέρες/Εβδομάδα | ${plan.sessionDuration} λεπτά\n\n`;

    plan.days.forEach((d) => {
      text += `[${d.dayName}] - Εστίαση: ${d.focus}\n`;
      d.exercises.forEach((ex, idx) => {
        text += `  ${idx + 1}. ${ex.greekName} - ${ex.sets} σετ x ${ex.reps} | Διάλειμμα: ${ex.restSeconds} δευτ.\n`;
      });
      text += `\n`;
    });

    text += `Οδηγία προπονητή: ${plan.coachAdvice}\n`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const setExerciseWeight = (exerciseId: string, value: string) => {
    setExerciseWeights((prev) => ({ ...prev, [exerciseId]: value }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Πρόγραμμα προπόνησης"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 overflow-y-auto print:p-0 print:bg-white print:text-black"
    >
      <div className="relative w-full max-w-4xl bg-surface border border-border p-6 sm:p-8 rounded-lg shadow-2xl my-8 print:border-none print:shadow-none print:bg-transparent">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-border gap-4 print:border-black">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase text-accent font-bold">
                Generated Workout Plan
              </span>
              {savedLocally && (
                <span className="text-[10px] bg-surface-elevated text-secondary px-1.5 py-0.5 rounded border border-border font-mono">
                  Αποθηκεύτηκε στη συσκευή
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white print:text-black mt-0.5">
              {plan.splitName}
            </h2>
            <div className="text-xs text-secondary mt-1">
              {plan.daysPerWeek} Ημέρες / Εβδομάδα • {plan.sessionDuration} λεπτά / προπόνηση • Επίπεδο:{" "}
              {EXPERIENCE_LABELS[plan.experienceLevel] ?? plan.experienceLevel}
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded bg-surface-elevated hover:bg-border text-xs font-semibold text-white border border-border flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Αντιγράφηκε" : "Αντιγραφή"}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded bg-surface-elevated hover:bg-border text-xs font-semibold text-white border border-border flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Εκτύπωση</span>
            </button>

            <button
              onClick={onReset}
              aria-label="Κλείσιμο"
              className="p-1.5 rounded text-secondary hover:text-white hover:bg-surface-elevated transition-colors"
              title="Κλείσιμο"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Coach Advice */}
        <div className="p-3.5 rounded bg-surface-card border border-border mb-6 text-xs text-secondary leading-relaxed">
          <strong className="text-white">Προπονητική Οδηγία: </strong>
          {plan.coachAdvice}
        </div>

        {/* Day Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-6 print:hidden">
          {plan.days.map((day, idx) => (
            <button
              key={idx}
              onClick={() => setActiveDayIdx(idx)}
              className={`px-3.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                activeDayIdx === idx
                  ? "bg-white text-black font-bold"
                  : "bg-surface-card border border-border text-secondary hover:text-white"
              }`}
            >
              {day.dayName.split(":")[0]}
            </button>
          ))}
        </div>

        {/* Active Day Table with Progressive Overload Cookie Logger */}
        <div className="bg-background rounded border border-border overflow-hidden mb-6">
          <div className="p-3.5 bg-surface-card border-b border-border flex items-center justify-between">
            <div className="text-xs font-bold text-white">{activeDay.dayName}</div>
            <div className="text-[11px] text-tertiary">Εστίαση: {activeDay.focus}</div>
          </div>

          <div className="divide-y divide-border">
            {activeDay.exercises.map((ex, i) => {
              const prevLog = exerciseLogs.find((l) => l.exerciseId === ex.exerciseId);
              return (
                <div key={i} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-white">
                      {i + 1}. {ex.greekName}
                    </div>
                    <div className="text-[11px] text-tertiary">
                      {ex.muscleGroup}
                    </div>
                    {ex.notes && (
                      <div className="text-[10px] text-accent mt-0.5 font-mono">
                        {ex.notes}
                      </div>
                    )}
                    {prevLog && (
                      <div className="text-[10px] text-secondary font-mono mt-1">
                        Τελευταία καταγραφή: <span className="text-white font-bold">{prevLog.weightKg} kg</span> ({prevLog.date})
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0 font-mono text-[11px]">
                    <div className="bg-surface-card px-2 py-1 rounded border border-border">
                      <span className="text-tertiary">Σετ: </span>
                      <span className="text-white font-bold">{ex.sets} x {ex.reps}</span>
                    </div>

                    <div className="bg-surface-card px-2 py-1 rounded border border-border">
                      <span className="text-tertiary">Διάλειμμα: </span>
                      <span className="text-accent font-bold">{ex.restSeconds}s</span>
                    </div>

                    {/* Weight Logger Input (localStorage) */}
                    <div className="flex items-center gap-1 print:hidden">
                      <WeightLoggerInput
                        exerciseId={ex.exerciseId}
                        value={exerciseWeights[ex.exerciseId] || ""}
                        onValueChange={(value) => setExerciseWeight(ex.exerciseId, value)}
                        onLogged={() => setLogRefreshTick((t) => t + 1)}
                        inputClassName="px-1.5 py-1 text-[11px]"
                        buttonClassName="p-1"
                        title="Καταγραφή κιλών"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Warmup & Cardio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-xs">
          <div className="p-3 rounded bg-surface border border-border space-y-1">
            <div className="font-semibold text-white">Προθέρμανση</div>
            <ul className="text-tertiary text-[11px] space-y-1">
              {plan.warmupProtocol.map((item, idx) => (
                <li key={idx}>— {item}</li>
              ))}
            </ul>
          </div>

          <div className="p-3 rounded bg-surface border border-border space-y-1">
            <div className="font-semibold text-white">Αερόβια Άσκηση</div>
            <p className="text-tertiary text-[11px] leading-relaxed">
              {plan.weeklyCardioRecommendation}
            </p>
          </div>
        </div>

        {/* Action Bottom */}
        <div className="pt-4 border-t border-border flex items-center justify-between print:hidden">
          <button
            onClick={onReset}
            className="text-xs text-secondary hover:text-white transition-colors"
          >
            Νέα Παραγωγή Προγράμματος
          </button>
          <button
            onClick={onOpenBooking}
            className="px-4 py-2 rounded bg-white hover:bg-white/90 text-black font-bold text-xs transition-colors"
          >
            Επικοινωνία με τη Γραμματεία
          </button>
        </div>
      </div>
    </div>
  );
};
