/**
 * Greek copy for the floor-plan feature.
 *
 * The module ships English defaults and expects the host to inject its own
 * `FloorPlanLabels` (see `src/modules/gym-floor-plan/types.ts`), so all
 * user-facing strings live here instead of being scattered across components.
 * The module's `summary` sentence keeps its English frame — the design document
 * calls that out as open question Q7 — but every label inside it is Greek.
 */

import {
  CELL_PATTERNS,
  DEFAULT_FLOOR_PLAN_LABELS,
  type CellPattern,
  type FloorPlanLabels,
} from "@/modules/gym-floor-plan";

export const GREEK_FLOOR_PLAN_LABELS: FloorPlanLabels = {
  ...DEFAULT_FLOOR_PLAN_LABELS,
  unavailable: "μη διαθέσιμο",
  openFloor: "ελεύθερος χώρος",
  equipment: "εξοπλισμός",
  row: "Σειρά",
  column: "στήλη",
  noEquipment: "χωρίς εξοπλισμό",
  unknownCategory: "άγνωστη κατηγορία",
};

export const FLOOR_PLAN_PATTERN_LABELS: Record<CellPattern, string> = {
  solid: "Συμπαγές",
  diagonal: "Διαγώνιες γραμμές",
  dots: "Κουκκίδες",
  grid: "Πλέγμα",
  cross: "Σταυρός",
};

/** Pattern choices in display order, for the category form's `<select>`. */
export const FLOOR_PLAN_PATTERN_OPTIONS: ReadonlyArray<{ value: CellPattern; label: string }> =
  CELL_PATTERNS.map((pattern) => ({ value: pattern, label: FLOOR_PLAN_PATTERN_LABELS[pattern] }));

/**
 * The Greek noun for "square", declined by count.
 *
 * Greek needs a different ending for one and for many, so every count-bearing
 * label used to hand-roll its own `count === 1 ? … : …`. The four call sites
 * lived in three files and had already drifted into a second grammatical case
 * (the delete dialog's `Καθαρισμός 1 τετραγώνου`), so the declension lives here
 * once, next to the rest of the copy.
 *
 * `case` selects nominative (counting: "3 τετράγωνα") or genitive (partitive:
 * "Καθαρισμός 3 τετραγώνων").
 */
export function squareNoun(
  count: number,
  grammaticalCase: "nominative" | "genitive" = "nominative"
): string {
  const singular = count === 1;
  if (grammaticalCase === "genitive") return singular ? "τετραγώνου" : "τετραγώνων";
  return singular ? "τετράγωνο" : "τετράγωνα";
}

/** `"3 τετράγωνα"` — a count and its declined noun, e.g. for the legend. */
export function formatSquareCount(
  count: number,
  grammaticalCase: "nominative" | "genitive" = "nominative"
): string {
  return `${count} ${squareNoun(count, grammaticalCase)}`;
}

/** Suggested palette for a new category; the owner can still pick any colour. */
export const FLOOR_PLAN_CATEGORY_PALETTE: ReadonlyArray<{ color: string; name: string }> = [
  { color: "#2563EB", name: "Μπλε" },
  { color: "#DC2626", name: "Κόκκινο" },
  { color: "#16A34A", name: "Πράσινο" },
  { color: "#F59E0B", name: "Πορτοκαλί" },
  { color: "#7C3AED", name: "Μωβ" },
  { color: "#0E7490", name: "Τυρκουάζ" },
  { color: "#FFFFFF", name: "Λευκό" },
  { color: "#111827", name: "Μαύρο" },
];
