// Shared currency formatting so prices render identically everywhere instead of
// each component rolling its own helper.
export function formatEuro(value: number): string {
  const rounded = Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(2)));
  return `${rounded}€`;
}

// The exercise database stores muscle groups and equipment as machine-friendly
// English keys; the interface shows Greek labels.
const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: "Στήθος",
  back: "Πλάτη",
  legs: "Πόδια",
  shoulders: "Ώμοι",
  arms: "Χέρια",
  core: "Κορμός",
};

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "Μπάρα",
  dumbbell: "Αλτήρες",
  cable: "Τροχαλία",
  machine: "Μηχάνημα",
  bodyweight: "Σωματικό βάρος",
};

export function muscleGroupLabel(value: string): string {
  return MUSCLE_GROUP_LABELS[value] ?? value;
}

export function equipmentLabel(value: string): string {
  return EQUIPMENT_LABELS[value] ?? value;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Αρχάριος",
  intermediate: "Μέσος",
  advanced: "Προχωρημένος",
};

export function difficultyLabel(value: string): string {
  return DIFFICULTY_LABELS[value] ?? value;
}
