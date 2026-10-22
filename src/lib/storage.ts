import { GeneratedWorkoutPlan } from "@/types";
import { hasConsent } from "./consent";

const SAVED_PLAN_KEY = "nexusfit_saved_workout";
const EXERCISE_LOGS_KEY = "nexusfit_exercise_logs";

export interface ExerciseLog {
  exerciseId: string;
  weightKg: number;
  repsAchieved: number;
  date: string;
}

// 1. Save Workout Plan to LocalStorage (with lightweight cookie indicator)
//    NB: the old `nexusfit_has_plan` cookie was removed — nothing ever read it
//    and it was written without consent. Persisting the plan is now gated on the
//    visitor having accepted optional storage.
//    Returns whether it actually persisted, so callers do not display a "saved"
//    indicator that is untrue (e.g. before consent is given).
export function saveWorkoutToDevice(plan: GeneratedWorkoutPlan): boolean {
  if (typeof window === "undefined") return false;
  if (!hasConsent()) return false;
  try {
    localStorage.setItem(SAVED_PLAN_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

// 2. Progressive Overload Logger (Tracking weight lifted per exercise in cookies/storage)
//    Storage is optional: without consent the entry is not persisted.
export function logExercisePerformance(log: ExerciseLog): void {
  if (typeof window === "undefined") return;
  if (!hasConsent()) return;
  try {
    const currentLogs = getExerciseLogs();
    const updated = [log, ...currentLogs.filter(l => l.exerciseId !== log.exerciseId || l.date !== log.date)].slice(0, 50);
    localStorage.setItem(EXERCISE_LOGS_KEY, JSON.stringify(updated));
  } catch {}
}

export function getExerciseLogs(): ExerciseLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EXERCISE_LOGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
