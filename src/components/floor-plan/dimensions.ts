/**
 * Floor dimension parsing and validation.
 *
 * Extracted from `FloorPanel` so the accept/reject rules for a typed size are
 * testable without a DOM. `FloorPanel` asks the same question three times (the
 * add form's two fields and the resize form's two fields), and the axis noun is
 * part of the message, so the mapping from axis to Greek label belongs next to
 * the rule rather than inline at each call site.
 */

import { FLOOR_PLAN_LIMITS } from "@/modules/gym-floor-plan";

export type DimensionAxis = "rows" | "cols";

/** Greek label for an axis, as shown on the field and inside the error text. */
const AXIS_LABELS: Record<DimensionAxis, string> = {
  rows: "Γραμμές",
  cols: "Στήλες",
};

export function axisLabel(axis: DimensionAxis): string {
  return AXIS_LABELS[axis];
}

/** Parses a typed dimension; `NaN` when the text has no leading number. */
export function parseDimension(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * `null` when `value` is an integer inside the axis's inclusive limits,
 * otherwise the user-facing reason.
 *
 * The limits come from `FLOOR_PLAN_LIMITS`, so the message can never drift from
 * the range the `<input>` advertises or the module enforces.
 */
export function dimensionError(value: number, axis: DimensionAxis): string | null {
  const min = axis === "rows" ? FLOOR_PLAN_LIMITS.minRows : FLOOR_PLAN_LIMITS.minCols;
  const max = axis === "rows" ? FLOOR_PLAN_LIMITS.maxRows : FLOOR_PLAN_LIMITS.maxCols;
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${axisLabel(axis)}: ακέραιος από ${min} έως ${max}.`;
  }
  return null;
}
