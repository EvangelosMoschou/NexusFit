import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getExerciseLogs, logExercisePerformance, saveWorkoutToDevice } from "./storage";
import { writeConsent } from "./consent";
import { installBrowserStorage } from "./testUtils/browserStorage";
import { GeneratedWorkoutPlan } from "@/types";

let store: Map<string, string>;

beforeEach(() => {
  store = installBrowserStorage();
  store.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const samplePlan: GeneratedWorkoutPlan = {
  id: "plan-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  userGoal: "hypertrophy",
  experienceLevel: "intermediate",
  daysPerWeek: 3,
  sessionDuration: 60,
  splitType: "full_body",
  splitName: "Test Split",
  coachAdvice: "Test advice",
  warmupProtocol: [],
  weeklyCardioRecommendation: "",
  days: [],
};

const sampleLog = {
  exerciseId: "bench-press",
  weightKg: 80,
  repsAchieved: 8,
  date: "2026-01-01",
};

describe("storage consent gating", () => {
  it("does not persist anything before consent is given", () => {
    expect(saveWorkoutToDevice(samplePlan)).toBe(false);
    logExercisePerformance(sampleLog);

    expect(store.size).toBe(0);
    expect(getExerciseLogs()).toEqual([]);
  });

  it("treats essential_only as a denial of optional storage", () => {
    writeConsent("essential_only");
    logExercisePerformance(sampleLog);

    expect(getExerciseLogs()).toEqual([]);
  });

  it("persists workout plans and exercise logs once consent is accepted", () => {
    writeConsent("accepted");

    logExercisePerformance(sampleLog);
    expect(getExerciseLogs()).toHaveLength(1);
    expect(getExerciseLogs()[0].exerciseId).toBe("bench-press");

    // The boolean return drives the "saved to device" badge in the UI.
    expect(saveWorkoutToDevice(samplePlan)).toBe(true);
    expect(store.has("nexusfit_saved_workout")).toBe(true);
  });

  it("never writes the removed nexusfit_has_plan cookie", () => {
    writeConsent("accepted");
    saveWorkoutToDevice(samplePlan);

    expect(store.has("nexusfit_has_plan")).toBe(false);
  });
});
