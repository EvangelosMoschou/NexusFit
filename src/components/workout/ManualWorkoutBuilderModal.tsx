"use client";

import React, { useState } from "react";
import { GeneratedWorkoutPlan, WorkoutDay, WorkoutExerciseItem } from "@/types";
import { X, Plus, Trash2, Save } from "lucide-react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { muscleGroupLabel } from "@/lib/format";

interface ManualWorkoutBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePlan: (plan: GeneratedWorkoutPlan) => void;
}

// 3 Placeholder Exercises for now (ready for future database expansion)
const PLACEHOLDER_EXERCISES = [
  { id: "ex-bench-press", greekName: "Πιέσεις Πάγκου με Μπάρα", name: "Barbell Bench Press", muscleGroup: "Στήθος", equipment: "barbell" },
  { id: "ex-squat", greekName: "Βαθιά Καθίσματα με Μπάρα", name: "Barbell Back Squat", muscleGroup: "Πόδια", equipment: "barbell" },
  { id: "ex-lat-pulldown", greekName: "Έλξεις στην Τροχαλία", name: "Lat Pulldown", muscleGroup: "Πλάτη", equipment: "cable" },
];

export const ManualWorkoutBuilderModal: React.FC<ManualWorkoutBuilderModalProps> = ({
  isOpen,
  onClose,
  onSavePlan,
}) => {
  const [splitName, setSplitName] = useState("Προσωπικό Πλάνο Ενδυνάμωσης");
  const [sessionDuration, setSessionDuration] = useState(60);
  const [days, setDays] = useState<WorkoutDay[]>([
    {
      dayNumber: 1,
      dayName: "Ημέρα 1: Άνω Σώμα / Στήθος & Πλάτη",
      focus: "Στήθος & Πλάτη",
      estimatedMinutes: 60,
      exercises: [
        {
          exerciseId: "ex-bench-press",
          name: "Barbell Bench Press",
          greekName: "Πιέσεις Πάγκου με Μπάρα",
          sets: 4,
          reps: "8-10",
          rpe: 8,
          restSeconds: 90,
          muscleGroup: "Στήθος",
        },
      ],
    },
  ]);

  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const handleAddDay = () => {
    const nextNum = days.length + 1;
    const newDay: WorkoutDay = {
      dayNumber: nextNum,
      dayName: `Ημέρα ${nextNum}: Προπόνηση`,
      focus: "Γενική Ενδυνάμωση",
      estimatedMinutes: 60,
      exercises: [
        {
          exerciseId: "ex-squat",
          name: "Barbell Back Squat",
          greekName: "Βαθιά Καθίσματα με Μπάρα",
          sets: 4,
          reps: "8-10",
          rpe: 8,
          restSeconds: 90,
          muscleGroup: "Πόδια",
        },
      ],
    };
    setDays([...days, newDay]);
  };

  const handleRemoveDay = (idx: number) => {
    if (days.length <= 1) return;
    setDays(days.filter((_, i) => i !== idx));
  };

  const handleAddExerciseToDay = (dayIdx: number) => {
    const defaultEx = PLACEHOLDER_EXERCISES[0];
    const newEx: WorkoutExerciseItem = {
      exerciseId: defaultEx.id,
      name: defaultEx.name,
      greekName: defaultEx.greekName,
      sets: 3,
      reps: "10-12",
      rpe: 8,
      restSeconds: 90,
      muscleGroup: defaultEx.muscleGroup,
    };
    const updatedDays = [...days];
    updatedDays[dayIdx].exercises.push(newEx);
    setDays(updatedDays);
  };

  const handleRemoveExercise = (dayIdx: number, exIdx: number) => {
    const updatedDays = [...days];
    updatedDays[dayIdx].exercises.splice(exIdx, 1);
    setDays(updatedDays);
  };

  const handleExerciseChange = (dayIdx: number, exIdx: number, exId: string) => {
    const selected = PLACEHOLDER_EXERCISES.find((e) => e.id === exId);
    if (!selected) return;
    const updatedDays = [...days];
    updatedDays[dayIdx].exercises[exIdx] = {
      ...updatedDays[dayIdx].exercises[exIdx],
      exerciseId: selected.id,
      name: selected.name,
      greekName: selected.greekName,
      muscleGroup: selected.muscleGroup,
    };
    setDays(updatedDays);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const createdPlan: GeneratedWorkoutPlan = {
      id: `manual-plan-${Date.now()}`,
      createdAt: new Date().toISOString(),
      userGoal: "hypertrophy",
      experienceLevel: "intermediate",
      daysPerWeek: days.length,
      sessionDuration: sessionDuration,
      splitType: "custom",
      splitName: splitName,
      coachAdvice: "Χειροκίνητα προσαρμοσμένο πρόγραμμα μέλους. Εστιάστε στην ορθή τεχνική και στη σταδιακή αύξηση φορτίου.",
      warmupProtocol: [
        "5-10 λεπτά γενική προθέρμανση (διάδρομος / ποδήλατο)",
        "Δυναμικές διατάσεις αρθρώσεων",
        "2 σετ προθέρμανσης με ελαφρύ βάρος",
      ],
      weeklyCardioRecommendation: "2 συνεδρίες 20 λεπτών μέτριας έντασης ανά εβδομάδα.",
      days: days,
    };

    onSavePlan(createdPlan);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Χειροκίνητη δημιουργία προγράμματος"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 overflow-y-auto"
    >
      <div className="relative w-full max-w-3xl bg-surface border border-border p-6 sm:p-8 rounded-xl shadow-2xl space-y-6 my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <div className="text-[10px] font-mono uppercase text-accent font-bold">
              Manual Routine Builder
            </div>
            <h2 className="text-xl font-bold text-primary tracking-tight mt-0.5">
              Χειροκίνητη Σύνταξη Προγράμματος
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Προσθέστε ημέρες και ασκήσεις από τη βάση δεδομένων του γυμναστηρίου.
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Κλείσιμο"
            className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-surface-elevated transition-colors border border-border"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* General Plan Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-secondary mb-1">
                Όνομα Προγράμματος
              </label>
              <input
                type="text"
                required
                value={splitName}
                onChange={(e) => setSplitName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-primary text-xs outline-none focus:border-border-light font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-secondary mb-1">
                Εκτιμώμενη Διάρκεια (Λεπτά)
              </label>
              <input
                type="number"
                min={20}
                max={120}
                value={sessionDuration}
                onChange={(e) => setSessionDuration(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-primary text-xs outline-none focus:border-border-light font-mono"
              />
            </div>
          </div>

          {/* Days and Exercises */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-primary">
                Ημέρες Προπόνησης ({days.length})
              </h3>
              <button
                type="button"
                onClick={handleAddDay}
                className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                <span>Προσθήκη Ημέρας</span>
              </button>
            </div>

            {days.map((day, dayIdx) => (
              <div
                key={dayIdx}
                className="p-4 rounded-xl bg-background border border-border space-y-4"
              >
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
                  <input
                    type="text"
                    value={day.dayName}
                    onChange={(e) => {
                      const updated = [...days];
                      updated[dayIdx].dayName = e.target.value;
                      setDays(updated);
                    }}
                    className="bg-transparent text-sm font-bold text-primary outline-none border-b border-transparent focus:border-border-light px-1 flex-1"
                  />
                  {days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDay(dayIdx)}
                      aria-label="Διαγραφή Ημέρας"
                      className="p-1 rounded text-red-400 hover:bg-red-950/40"
                      title="Διαγραφή Ημέρας"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Exercises list */}
                <div className="space-y-2.5">
                  {day.exercises.map((ex, exIdx) => (
                    <div
                      key={exIdx}
                      className="p-3 rounded-lg bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1">
                        <label className="block text-[10px] font-mono text-tertiary uppercase mb-1">
                          Επιλογή Άσκησης (Database):
                        </label>
                        <select
                          value={ex.exerciseId}
                          onChange={(e) => handleExerciseChange(dayIdx, exIdx, e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-primary text-xs outline-none"
                        >
                          {PLACEHOLDER_EXERCISES.map((dbEx) => (
                            <option key={dbEx.id} value={dbEx.id}>
                              {dbEx.greekName} - {muscleGroupLabel(dbEx.muscleGroup)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div>
                          <label className="block text-[10px] text-tertiary mb-0.5">Σετ</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={ex.sets}
                            onChange={(e) => {
                              const updated = [...days];
                              updated[dayIdx].exercises[exIdx].sets = Number(e.target.value);
                              setDays(updated);
                            }}
                            className="w-14 px-2 py-1 rounded bg-background border border-border text-primary text-center font-mono text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-tertiary mb-0.5">Επαναλήψεις</label>
                          <input
                            type="text"
                            value={ex.reps}
                            onChange={(e) => {
                              const updated = [...days];
                              updated[dayIdx].exercises[exIdx].reps = e.target.value;
                              setDays(updated);
                            }}
                            className="w-16 px-2 py-1 rounded bg-background border border-border text-primary text-center font-mono text-xs"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(dayIdx, exIdx)}
                          aria-label="Αφαίρεση άσκησης"
                          className="mt-4 p-1.5 rounded text-secondary hover:text-red-400"
                          title="Αφαίρεση άσκησης"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => handleAddExerciseToDay(dayIdx)}
                    className="w-full py-2 rounded-lg bg-surface hover:bg-surface-elevated text-secondary hover:text-primary text-xs font-semibold border border-dashed border-border transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Προσθήκη Άσκησης στην {day.dayName.split(":")[0]}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-secondary hover:text-primary transition-colors"
            >
              Ακύρωση
            </button>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>Αποθήκευση στο Ιστορικό μου</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
