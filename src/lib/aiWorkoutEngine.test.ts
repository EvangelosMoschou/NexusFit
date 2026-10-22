import { describe, expect, it } from "vitest";
import { generateSmartWorkoutPlan } from "./aiWorkoutEngine";
import { exercisesDatabase } from "@/data/exercisesData";
import { UserPreferences } from "@/types";

const base: UserPreferences = {
  gender: "male",
  goal: "hypertrophy",
  experience: "intermediate",
  daysPerWeek: 4,
  durationMinutes: 60,
  injuries: [],
  equipmentAccess: "full_gym",
};

const planFor = (prefs: Partial<UserPreferences>) =>
  generateSmartWorkoutPlan({ ...base, ...prefs });

const firstExercise = (daysPerWeek: number, goal: UserPreferences["goal"] = "hypertrophy") =>
  planFor({ daysPerWeek, goal }).days[0].exercises[0];

describe("generateSmartWorkoutPlan", () => {
  it.each([3, 4, 5, 6])("returns exactly %i days for a %i-day request", (days) => {
    const plan = planFor({ daysPerWeek: days });
    expect(plan.days).toHaveLength(days);
    expect(plan.days.map((d) => d.dayNumber)).toEqual(
      Array.from({ length: days }, (_, i) => i + 1)
    );
  });

  it("selects the right split architecture per frequency", () => {
    expect(planFor({ daysPerWeek: 3 }).splitType).toBe("full_body");
    expect(planFor({ daysPerWeek: 4 }).splitType).toBe("upper_lower");
    expect(planFor({ daysPerWeek: 5 }).splitType).toBe("push_pull_legs");
    expect(planFor({ daysPerWeek: 5 }).splitName).toContain("5-Day");
  });

  it("renumbers cycled days for 5-6 day splits", () => {
    const plan = planFor({ daysPerWeek: 6 });
    expect(plan.days[4].dayName).toMatch(/^Ημέρα 5:/);
    expect(plan.days[5].dayName).toMatch(/^Ημέρα 6:/);
    // Day 5 repeats the first upper-body template
    expect(plan.days[4].focus).toBe(plan.days[0].focus);
  });

  it("uses 4 sets for 75+ minute sessions and 3 otherwise", () => {
    expect(firstExercise(4).sets).toBe(3);
    expect(planFor({ daysPerWeek: 4, durationMinutes: 90 }).days[0].exercises[0].sets).toBe(4);
  });

  it("adjusts reps, RPE and rest to the training goal", () => {
    const strength = firstExercise(4, "strength");
    const fatLoss = firstExercise(4, "fat_loss");
    expect(strength.reps).toBe("4-6");
    expect(strength.restSeconds).toBe(120);
    expect(fatLoss.reps).toBe("12-15");
    expect(fatLoss.restSeconds).toBe(60);
  });

  it("excludes shoulder-flagged exercises when the user reports shoulder pain", () => {
    expect(firstExercise(4, "strength").exerciseId).toBe("ex-bench-press");

    const withInjury = planFor({ daysPerWeek: 4, goal: "strength", injuries: ["shoulders"] });
    const chestPick = withInjury.days[0].exercises[0];
    expect(chestPick.exerciseId).not.toBe("ex-bench-press");
  });

  it("clamps a frequency below the supported minimum instead of returning a broken plan", () => {
    for (const days of [0, 1, 2, -3]) {
      const plan = planFor({ daysPerWeek: days });

      expect(plan.days).toHaveLength(3);
      expect(plan.daysPerWeek).toBe(3);
      // These were empty before clamping, which made the server reject the plan
      // on save (it validates splitName) and rendered a nameless plan in the UI.
      expect(plan.splitName.length).toBeGreaterThan(0);
      expect(plan.coachAdvice.length).toBeGreaterThan(0);
    }
  });

  it("clamps a frequency above the supported maximum", () => {
    const plan = planFor({ daysPerWeek: 12 });
    expect(plan.days).toHaveLength(7);
    expect(plan.daysPerWeek).toBe(7);
  });

  it("honours equipmentAccess instead of ignoring it", () => {
    const equipmentOf = (id: string) => exercisesDatabase.find((e) => e.id === id)?.equipment;
    const plan = planFor({ daysPerWeek: 4, equipmentAccess: "dumbbells_only" });

    // Everything outside the arms slot must match the member's equipment. Arms
    // is exempt because the dataset has no dumbbell/bodyweight arm exercise, in
    // which case the engine deliberately falls back rather than leaving a gap.
    const nonArms = plan.days
      .flatMap((d) => d.exercises)
      .filter((e) => e.muscleGroup !== "Χέρια");

    expect(nonArms.length).toBeGreaterThan(0);
    for (const exercise of nonArms) {
      expect(["dumbbell", "bodyweight"]).toContain(equipmentOf(exercise.exerciseId));
    }
  });

  it("never returns a day without exercises for any equipment/injury combination", () => {
    for (const equipmentAccess of ["full_gym", "dumbbells_only", "home_gym"] as const) {
      for (const injuries of [[], ["shoulders"], ["lower_back", "knees", "shoulders", "wrist"]]) {
        for (const daysPerWeek of [3, 4, 5, 6, 7]) {
          const plan = planFor({ equipmentAccess, injuries, daysPerWeek });
          expect(plan.days.every((d) => d.exercises.length > 0)).toBe(true);
        }
      }
    }
  });

  it("scales volume and intensity with experience", () => {
    const firstSets = (experience: UserPreferences["experience"]) =>
      planFor({ daysPerWeek: 4, experience }).days[0].exercises[0].sets;

    expect(firstSets("intermediate")).toBe(3);
    expect(firstSets("beginner")).toBe(2);
    expect(firstSets("advanced")).toBe(4);

    // A beginner also trains at a lower RPE than an intermediate.
    const beginnerRpe = planFor({ daysPerWeek: 4, experience: "beginner" }).days[0].exercises[0].rpe;
    const intermediateRpe = planFor({ daysPerWeek: 4, experience: "intermediate" }).days[0].exercises[0].rpe;
    expect(beginnerRpe!).toBeLessThan(intermediateRpe!);
  });

  it("applies experience to isolation slots too, never dropping below two sets", () => {
    const beginner = planFor({ daysPerWeek: 4, experience: "beginner", durationMinutes: 30 });
    const allSets = beginner.days.flatMap((d) => d.exercises.map((e) => e.sets));

    expect(allSets.length).toBeGreaterThan(0);
    expect(Math.min(...allSets)).toBeGreaterThanOrEqual(2);
  });

  it("states the experience level in the plan", () => {
    const beginner = planFor({ daysPerWeek: 4, experience: "beginner" });
    expect(beginner.experienceLevel).toBe("beginner");
    expect(beginner.coachAdvice).toContain("αρχάριος");

    const advanced = planFor({ daysPerWeek: 4, experience: "advanced" });
    expect(advanced.experienceLevel).toBe("advanced");
    expect(advanced.coachAdvice).toContain("προχωρημένος");
  });
});
