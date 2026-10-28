export type WorkoutGoal = 
  | "hypertrophy" // Μυϊκή Μάζα
  | "fat_loss"    // Απώλεια Λίπους & Γράμμωση
  | "strength"    // Αύξηση Δύναμης
  | "endurance"   // Αντοχή & Conditioning
  | "general_fit";// Γενική Φυσική Κατάσταση

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type WorkoutSplitType = 
  | "full_body" 
  | "upper_lower" 
  | "push_pull_legs" 
  | "arnold_split" 
  | "bro_split"
  | "custom";

export interface Exercise {
  id: string;
  name: string;
  greekName: string;
  muscleGroup: "chest" | "back" | "legs" | "shoulders" | "arms" | "core" | "cardio";
  equipment: "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight";
  difficulty: "beginner" | "intermediate" | "advanced";
  description: string;
  targetMuscles: string[];
  injuryRisks: string[]; // e.g. ["lower_back", "shoulder"]
  alternativeIds?: string[];
  tips: string;
  videoPlaceholderUrl?: string;
}

export interface WorkoutExerciseItem {
  exerciseId: string;
  name: string;
  greekName: string;
  sets: number;
  reps: string; // e.g. "8-10" or "12-15"
  rpe?: number; // e.g. 7.5, 8
  restSeconds: number;
  notes?: string;
  muscleGroup: string;
  alternative?: {
    name: string;
    greekName: string;
    reason: string;
  };
}

export interface WorkoutDay {
  dayNumber: number;
  dayName: string; // e.g. "Ημέρα 1: Στήθος & Τρικέφαλοι (Push A)"
  focus: string;
  estimatedMinutes: number;
  exercises: WorkoutExerciseItem[];
}

export interface GeneratedWorkoutPlan {
  id: string;
  createdAt: string;
  userGoal: WorkoutGoal;
  experienceLevel: ExperienceLevel;
  daysPerWeek: number;
  sessionDuration: number;
  splitType: WorkoutSplitType;
  splitName: string;
  coachAdvice: string;
  warmupProtocol: string[];
  days: WorkoutDay[];
  weeklyCardioRecommendation: string;
}

export interface UserPreferences {
  name?: string;
  gender: "male" | "female" | "other";
  age?: number;
  goal: WorkoutGoal;
  experience: ExperienceLevel;
  daysPerWeek: number;
  durationMinutes: number;
  injuries: string[]; // ["lower_back", "knees", "shoulders", "wrist", "none"]
  equipmentAccess: "full_gym" | "dumbbells_only" | "home_gym";
}

// Gym White-label Config Interfaces
export interface GymClassSchedule {
  id: string;
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  dayGreek: string;
  time: string;
  className: string;
  category: "HIIT" | "Pilates" | "Yoga" | "Strength" | "Boxing" | "Cycling";
  trainer: string;
  intensity: "High" | "Medium" | "Low";
  duration: string;
}

export interface Trainer {
  id: string;
  name: string;
  role: string;
  specialty: string[];
  bio: string;
  image: string;
  instagram?: string;
  experienceYears: number;
}

export interface PricingPlan {
  id: string;
  name: string;
  badge?: string;
  priceMonth: number;
  priceQuarter?: number;
  priceYear?: number;
  popular?: boolean;
  features: string[];
  notIncluded?: string[];
  ctaText: string;
}

export interface Facility {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  iconName: string;
  imageUrl: string;
}

export interface LegalSection {
  title: string;
  body: string;
}

export interface GymAnnouncement {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning";
  date?: string;
}

export interface GymConfig {
  gymName: string;
  legalName: string;
  tagline: string;
  description: string;
  city: string;
  address: string;
  phone?: string;
  email: string;
  workingHours: {
    weekdays: string;
    saturday: string;
    sunday: string;
  };
  socials: {
    instagram: string;
    facebook: string;
    tiktok?: string;
  };
  stats: {
    squareMeters: number;
    activeMembers: number;
    expertTrainers: number;
    weeklyClasses: number;
  };
  announcements: GymAnnouncement[];
  facilities: Facility[];
  schedule: GymClassSchedule[];
  trainers: Trainer[];
  pricing: PricingPlan[];
  legal: {
    tos: LegalSection[];
    privacy: LegalSection[];
  };
}
