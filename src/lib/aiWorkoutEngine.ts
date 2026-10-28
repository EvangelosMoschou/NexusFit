import { 
  UserPreferences, 
  GeneratedWorkoutPlan, 
  WorkoutDay, 
  WorkoutSplitType,
  Exercise
} from "@/types";
import { 
  getSafeExercisesForMuscle 
} from "@/data/exercisesData";

// Core AI Split & Routine Synthesis Engine
export function generateSmartWorkoutPlan(prefs: UserPreferences): GeneratedWorkoutPlan {
  const { goal, experience, durationMinutes, injuries, equipmentAccess } = prefs;

  // Clamp the requested frequency to the supported range (3-7). Outside it every
  // branch below falls through, which used to return an empty split name (which
  // the server then rejects when saving the plan) and the wrong number of days.
  const daysPerWeek = Math.min(7, Math.max(3, Math.trunc(prefs.daysPerWeek) || 3));

  // Honour the member's available equipment; "full_gym" (or an unknown value)
  // means no filtering.
  const allowedEquipment: Exercise["equipment"][] | null =
    equipmentAccess === "dumbbells_only"
      ? ["dumbbell", "bodyweight"]
      : equipmentAccess === "home_gym"
      ? ["barbell", "dumbbell", "bodyweight"]
      : null;

  // Stated inside the plan so the member can see how it was tailored.
  const experienceNote =
    experience === "beginner"
      ? " Ως αρχάριος, ξεκινήστε με χαμηλά κιλά και δώστε προτεραιότητα στην τεχνική εκτέλεση."
      : experience === "advanced"
      ? " Ως προχωρημένος, προσαρμόστε τον όγκο ανάλογα με την ανάρρωσή σας."
      : "";

  // 1. Determine optimal split architecture based on days & experience
  let splitType: WorkoutSplitType = "full_body";
  let splitName = "";
  let coachAdvice = "";

  if (daysPerWeek === 3) {
    splitType = "full_body";
    splitName = "Πρόγραμμα 3 Ημερών – Πλήρες Σώμα";
    coachAdvice = "Ιδανική συχνότητα για μέγιστη πρωτεϊνοσύνθεση. Εστιάστε στην εκτέλεση βασικών πολυαρθρικών ασκήσεων με ένταση 7,5 - 8,5.";
  } else if (daysPerWeek === 4) {
    splitType = "upper_lower";
    splitName = "Πρόγραμμα 4 Ημερών – Άνω / Κάτω Σώμα";
    coachAdvice = "Εξαιρετική ισορροπία όγκου προπόνησης και ανάρρωσης. Δώστε έμφαση στη σταδιακή αύξηση επιβάρυνσης στα πρώτα σύνθετα σετ.";
  } else if (daysPerWeek >= 5) {
    splitType = "push_pull_legs";
    splitName = `Πρόγραμμα ${daysPerWeek} Ημερών – Ώθηση / Έλξη / Πόδια`;
    coachAdvice = "Υψηλός όγκος ανά μυϊκή ομάδα. Διασφαλίστε επαρκή ύπνο (7-8 ώρες) και κατανάλωση πρωτεΐνης (1,6 - 2,2 γρ. ανά κιλό σωματικού βάρους).";
  }

  // 2. Adjust Rep ranges & RPE targets based on primary goal
  let primaryReps = "8-10";
  let isolationReps = "10-12";
  let restCompound = 90;
  let restIsolation = 60;

  // Experience scales volume and intensity: intermediate is the baseline, a
  // beginner does one set fewer at a lower RPE, an advanced lifter one set more.
  const baseSets = durationMinutes >= 75 ? 4 : 3;
  const setsAdjustment = experience === "beginner" ? -1 : experience === "advanced" ? 1 : 0;
  const targetSets = Math.max(2, baseSets + setsAdjustment);
  // Isolation slots sit one set below the compound target (3 at baseline).
  const isolationSets = Math.max(2, 3 + setsAdjustment);
  const rpeAdjustment = experience === "beginner" ? -1 : 0;

  switch (goal) {
    case "strength":
      primaryReps = "4-6";
      isolationReps = "6-8";
      restCompound = 120;
      restIsolation = 90;
      break;
    case "fat_loss":
    case "endurance":
      primaryReps = "12-15";
      isolationReps = "15-20";
      restCompound = 60;
      restIsolation = 45;
      break;
    case "hypertrophy":
    default:
      primaryReps = "8-10";
      isolationReps = "10-12";
      restCompound = 90;
      restIsolation = 60;
      break;
  }

  // 3. Assemble Days and Exercises safely using Pantelis dataset
  // A slot pulls a window of safe exercises from one muscle group and applies
  // the set/rep/RPE/rest targets chosen above.
  type ExerciseSlot = {
    muscle: "chest" | "back" | "legs" | "shoulders" | "arms" | "core";
    slice: [number, number];
    sets: number;
    reps: string;
    rpe: number;
    restSeconds: number;
    muscleGroup: string;
  };

  const buildDay = (
    dayNumber: number,
    dayName: string,
    focus: string,
    slots: ExerciseSlot[]
  ): WorkoutDay => ({
    dayNumber,
    dayName,
    focus,
    estimatedMinutes: durationMinutes,
    exercises: slots.flatMap((slot) => {
      const safe = getSafeExercisesForMuscle(slot.muscle, injuries);
      const preferred = allowedEquipment
        ? safe.filter((e) => allowedEquipment.includes(e.equipment))
        : safe;

      // Take the requested window from the equipment-filtered list.
      let window = preferred.slice(slot.slice[0], slot.slice[1]);

      if (window.length === 0 && preferred.length > 0) {
        // Not enough matching exercises for this window: reuse one that does
        // match the member's equipment rather than dropping to equipment they
        // do not have.
        window = preferred.slice(0, 1);
      }

      if (window.length === 0) {
        // Nothing at all matches the member's equipment for this muscle (a gap
        // in the dataset): fall back to the injury-safe list so the day still
        // receives an exercise instead of being silently left short.
        window = safe.slice(slot.slice[0], slot.slice[1]);
      }

      return window.map((e) => ({
        exerciseId: e.id,
        name: e.name,
        greekName: e.greekName,
        sets: slot.sets,
        reps: slot.reps,
        rpe: Math.max(6, Math.min(10, slot.rpe + rpeAdjustment)),
        restSeconds: slot.restSeconds,
        muscleGroup: slot.muscleGroup,
        notes: e.tips,
      }));
    }),
  });

  const days: WorkoutDay[] = [];

  if (splitType === "full_body") {
    // Day 1: Full Body A
    days.push(
      buildDay(1, "Ημέρα 1: Δύναμη Πλήρους Σώματος (Α)", "Στήθος, Τετρακέφαλοι & Πλάτη", [
        { muscle: "chest", slice: [0, 1], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Στήθος" },
        { muscle: "legs", slice: [0, 1], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Πόδια (Τετρακέφαλοι)" },
        { muscle: "back", slice: [0, 1], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Πλάτη" },
        { muscle: "shoulders", slice: [0, 1], sets: isolationSets, reps: isolationReps, rpe: 8.5, restSeconds: restIsolation, muscleGroup: "Ώμοι" },
      ])
    );

    // Day 2: Full Body B
    days.push(
      buildDay(2, "Ημέρα 2: Όγκος Πλήρους Σώματος (Β)", "Πλάτη, Οπίσθιοι Μηριαίοι & Στήθος", [
        { muscle: "back", slice: [1, 2], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Πλάτη (Κάθετη Έλξη)" },
        { muscle: "legs", slice: [1, 2], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Οπίσθιοι Μηριαίοι" },
        { muscle: "chest", slice: [1, 2], sets: isolationSets, reps: isolationReps, rpe: 8.5, restSeconds: restIsolation, muscleGroup: "Στήθος" },
      ])
    );

    // Day 3: Full Body C
    days.push(
      buildDay(3, "Ημέρα 3: Υπερτροφία Πλήρους Σώματος (Γ)", "Ώμοι, Χέρια & Πόδια", [
        { muscle: "shoulders", slice: [0, 1], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Ώμοι" },
        { muscle: "legs", slice: [0, 1], sets: targetSets, reps: isolationReps, rpe: 8.5, restSeconds: restIsolation, muscleGroup: "Πόδια" },
        { muscle: "arms", slice: [0, 2], sets: isolationSets, reps: isolationReps, rpe: 9, restSeconds: restIsolation, muscleGroup: "Χέρια (Δικέφαλοι / Τρικέφαλοι)" },
      ])
    );
  } else {
    // Upper / Lower or PPL structure: 4 rotating day templates, so 5-6 day
    // splits repeat the cycle instead of returning fewer days than requested.
    const splitDays: Array<{ dayName: string; focus: string; slots: ExerciseSlot[] }> = [
      {
        dayName: "Ημέρα 1: Δύναμη Άνω Σώματος",
        focus: "Στήθος, Πλάτη & Ώμοι",
        slots: [
          { muscle: "chest", slice: [0, 1], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Στήθος" },
          { muscle: "back", slice: [0, 1], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Πλάτη" },
          { muscle: "shoulders", slice: [0, 1], sets: isolationSets, reps: isolationReps, rpe: 8.5, restSeconds: restIsolation, muscleGroup: "Ώμοι" },
        ],
      },
      {
        dayName: "Ημέρα 2: Κάτω Σώμα – Τετρακέφαλοι & Οπίσθιοι",
        focus: "Τετρακέφαλοι, Γλουτοί & Γάμπες",
        slots: [
          { muscle: "legs", slice: [0, 2], sets: targetSets, reps: primaryReps, rpe: 8.5, restSeconds: restCompound, muscleGroup: "Πόδια" },
        ],
      },
      {
        dayName: "Ημέρα 3: Υπερτροφία Άνω Σώματος & Χέρια",
        focus: "Πλάτη, Στήθος & Βραχίονες",
        slots: [
          { muscle: "back", slice: [1, 2], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Πλάτη (Κάθετη Έλξη)" },
          { muscle: "arms", slice: [0, 2], sets: isolationSets, reps: isolationReps, rpe: 9, restSeconds: restIsolation, muscleGroup: "Χέρια" },
        ],
      },
      {
        dayName: "Ημέρα 4: Κάτω Σώμα – Οπίσθια Αλυσίδα & Κορμός",
        focus: "Οπίσθιοι Μηριαίοι, Γλουτοί & Κοιλιακοί",
        slots: [
          { muscle: "legs", slice: [1, 2], sets: targetSets, reps: primaryReps, rpe: 8, restSeconds: restCompound, muscleGroup: "Οπίσθιοι Μηριαίοι" },
        ],
      },
    ];

    for (let i = 0; i < daysPerWeek; i++) {
      const tpl = splitDays[i % splitDays.length];
      days.push(
        buildDay(
          i + 1,
          `Ημέρα ${i + 1}: ${tpl.dayName.replace(/^Ημέρα \d+: /, "")}`,
          tpl.focus,
          tpl.slots
        )
      );
    }
  }

  // 4. Warm-up Protocol & Cardio Prescription
  const warmupProtocol = [
    "5-8 λεπτά αερόβια προθέρμανση χαμηλής έντασης (διάδρομος, ποδήλατο, ελλειπτικό)",
    "Δυναμικές διατάσεις & κινητικότητα ισχίων, θωρακικής μοίρας και ώμων",
    "2-3 σταδιακά σετ προθέρμανσης στην πρώτη άσκηση της ημέρας με προοδευτική αύξηση κιλών",
  ];

  let weeklyCardioRecommendation = "2 συνεδρίες 20-25 λεπτών αερόβιας χαμηλής έντασης (διάδρομος με κλίση ή ποδήλατο) ανά εβδομάδα.";
  if (goal === "fat_loss") {
    weeklyCardioRecommendation = "3-4 συνεδρίες 30 λεπτών αερόβιας χαμηλής έντασης ή 2 συνεδρίες υψηλής έντασης 15 λεπτών μετά την προπόνηση.";
  }

  return {
    id: `plan-${Date.now()}`,
    createdAt: new Date().toISOString(),
    userGoal: goal,
    experienceLevel: experience,
    daysPerWeek,
    sessionDuration: durationMinutes,
    splitType,
    splitName,
    coachAdvice: coachAdvice + experienceNote,
    warmupProtocol,
    days,
    weeklyCardioRecommendation,
  };
}
