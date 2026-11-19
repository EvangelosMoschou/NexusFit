/**
 * Gym floor plan — pure presentation helpers.
 *
 * Rendering is intentionally split from the model: `buildFloorRenderModel`
 * turns a plan + floor into a packed, row-major index of *appearances*, a
 * legend and a screen-reader summary. A React, SVG or canvas component then
 * walks that index and draws — no layout maths, no colour parsing and no
 * accessibility logic in JSX.
 *
 * ## Why the model is packed
 *
 * A floor is mostly repetition. On a realistic plan the grid uses a handful of
 * appearances: one per category (at most 20), plus empty floor, plus void, plus
 * the unknown-category fallback. The old model nevertheless allocated one
 * JavaScript object per square — `{ row, col, kind, categoryId, color,
 * inkColor, shortLabel, pattern, ariaLabel, tooltip }` — which measured
 * ~330 bytes of retained heap per square once the two derived accessible
 * strings were counted. At the 96 × 96 ceiling that is 9 216 objects and ~3 MB
 * per floor, ~18 MB for the six floors a plan may have, for information that
 * fits in 18 KB.
 *
 * So the model is two things instead:
 *
 * - `cellAppearanceIndex`: a `Uint16Array`, exactly `rows * cols` entries, each
 *   one an index into the appearance table. 2 bytes per square, linear to walk.
 * - `appearances`: the distinct `CellAppearance` values, allocated once each
 *   and shared by every square that looks the same.
 *
 * The per-square accessible strings (`ariaLabel`, `tooltip`) are the one part
 * that genuinely cannot be shared, because they name the square's position.
 * They are therefore *derived on demand* for the one square a user focuses or
 * hovers — `describeCell(row, col)` — instead of being pre-allocated 9 216
 * times.
 *
 * No React import: these are plain values and strings.
 */

import { findFloor, FloorPlanError } from "./model";
import {
  FLOOR_PLAN_LIMITS,
  type CellAppearance,
  type CellPattern,
  type Floor,
  type FloorPlanLabels,
  type FloorPlanTheme,
  type FloorRenderModel,
  type GymFloorPlan,
  type LegendEntry,
  type PatternBackground,
} from "./types";

/**
 * Neutral dark theme (matches the NexusFit default palette closely enough to
 * drop in, but the host is expected to pass its own tokens).
 */
export const DEFAULT_FLOOR_PLAN_THEME: FloorPlanTheme = Object.freeze({
  surfaceColor: "#111827",
  emptyColor: "#1F2937",
  gridLineColor: "#374151",
  voidColor: "#4B5563",
  inkColor: "#F9FAFB",
  mutedInkColor: "#9CA3AF",
});

/**
 * Print theme. Printing a dark plan wastes ink and, in most browsers, drops
 * background fills entirely — so the printed plan relies on the short labels
 * and patterns, with a light background that keeps them readable.
 */
export const PRINT_FLOOR_PLAN_THEME: FloorPlanTheme = Object.freeze({
  surfaceColor: "#FFFFFF",
  emptyColor: "#F9FAFB",
  gridLineColor: "#D1D5DB",
  voidColor: "#9CA3AF",
  inkColor: "#111827",
  mutedInkColor: "#4B5563",
});

export const DEFAULT_FLOOR_PLAN_LABELS: FloorPlanLabels = Object.freeze({
  unavailable: "unavailable",
  openFloor: "open floor",
  equipment: "equipment",
  row: "Row",
  column: "column",
  noEquipment: "no equipment",
  unknownCategory: "unknown category",
});

/**
 * The colour used for a machine square whose `categoryId` no plan category
 * matches. Validation rejects such a plan, but a renderer must never crash on
 * data that reached it another way, so it draws a visibly "wrong" swatch.
 */
const UNKNOWN_CATEGORY_COLOR = "#DC2626";
const UNKNOWN_CATEGORY_SHORT_LABEL = "?";
const UNKNOWN_CATEGORY_PATTERN: CellPattern = "cross";

/** The fixed short label of a void square — a third encoding, never a colour. */
const VOID_SHORT_LABEL = "×";
const VOID_PATTERN: CellPattern = "diagonal";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHexColor(value: string): Rgb | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Picks black or white text for a background using WCAG relative luminance.
 * This is why category colours are restricted to `#RRGGBB`: the module can
 * guarantee the short label stays readable on every swatch.
 *
 * Returns black for unparseable values (e.g. a theme that passes a CSS
 * variable instead of a resolved hex colour).
 */
export function getInkColor(background: string): "#000000" | "#ffffff" {
  const rgb = parseHexColor(background);
  if (!rgb) return "#000000";
  const luminance = relativeLuminance(rgb);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithBlack >= contrastWithWhite ? "#000000" : "#ffffff";
}

/**
 * CSS background for a category pattern. The pattern is drawn in the ink colour
 * at low alpha over the category colour, so it remains visible on light and
 * dark swatches alike.
 */
export function patternToBackground(pattern: CellPattern, inkColor: string): PatternBackground {
  switch (pattern) {
    case "solid":
      return { backgroundImage: "none" };
    case "diagonal":
      return {
        backgroundImage: `repeating-linear-gradient(45deg, ${inkColor}26 0 2px, transparent 2px 7px)`,
      };
    case "dots":
      return {
        backgroundImage: `radial-gradient(${inkColor}40 1px, transparent 1.2px)`,
        backgroundSize: "6px 6px",
      };
    case "grid":
      return {
        backgroundImage:
          `repeating-linear-gradient(0deg, ${inkColor}26 0 1px, transparent 1px 6px), ` +
          `repeating-linear-gradient(90deg, ${inkColor}26 0 1px, transparent 1px 6px)`,
      };
    case "cross":
      return {
        backgroundImage:
          `linear-gradient(45deg, transparent 46%, ${inkColor}33 46% 54%, transparent 54%), ` +
          `linear-gradient(-45deg, transparent 46%, ${inkColor}33 46% 54%, transparent 54%)`,
        backgroundSize: "8px 8px",
      };
  }
}

function requireFloor(plan: GymFloorPlan, floorId: string): Floor {
  const floor = findFloor(plan, floorId);
  if (!floor) {
    throw new FloorPlanError("unknown-floor", `No floor with id "${floorId}".`);
  }
  return floor;
}

function cellAt(floor: Floor, row: number, col: number): Floor["cells"][number][number] {
  return floor.cells[row]?.[col] ?? { kind: "empty" as const };
}

/**
 * The **shared** half of one square's resolved appearance: everything except
 * the position-dependent accessible strings.
 *
 * This is what populates `FloorRenderModel.appearances`, so it runs at most
 * `maxCategories + 3` times per floor rather than once per square.
 */
function appearanceForCell(
  plan: GymFloorPlan,
  cell: Floor["cells"][number][number],
  theme: FloorPlanTheme
): CellAppearance {
  if (cell.kind === "empty") {
    return {
      kind: "empty",
      categoryId: null,
      color: theme.emptyColor,
      inkColor: getInkColor(theme.emptyColor),
      shortLabel: "",
      pattern: "solid",
    };
  }

  if (cell.kind === "void") {
    return {
      kind: "void",
      categoryId: null,
      color: theme.voidColor,
      inkColor: getInkColor(theme.voidColor),
      shortLabel: VOID_SHORT_LABEL,
      pattern: VOID_PATTERN,
    };
  }

  const category = plan.categories.find((candidate) => candidate.id === cell.categoryId);
  if (!category) {
    // Validation rejects this, but a renderer should never crash on bad data.
    return {
      kind: "machine",
      categoryId: cell.categoryId,
      color: UNKNOWN_CATEGORY_COLOR,
      inkColor: getInkColor(UNKNOWN_CATEGORY_COLOR),
      shortLabel: UNKNOWN_CATEGORY_SHORT_LABEL,
      pattern: UNKNOWN_CATEGORY_PATTERN,
    };
  }

  return {
    kind: "machine",
    categoryId: category.id,
    color: category.color,
    inkColor: getInkColor(category.color),
    shortLabel: category.shortLabel,
    pattern: category.pattern,
  };
}

/** The position-dependent accessible strings for ONE square. */
function describeAppearance(
  plan: GymFloorPlan,
  cell: Floor["cells"][number][number],
  row: number,
  col: number,
  labels: FloorPlanLabels
): { ariaLabel: string; tooltip: string } {
  const position = `${labels.row} ${row + 1}, ${labels.column} ${col + 1}`;

  if (cell.kind === "empty") {
    return { ariaLabel: `${position}: ${labels.openFloor}`, tooltip: labels.openFloor };
  }

  if (cell.kind === "void") {
    return { ariaLabel: `${position}: ${labels.unavailable}`, tooltip: labels.unavailable };
  }

  const category = plan.categories.find((candidate) => candidate.id === cell.categoryId);
  if (!category) {
    return {
      ariaLabel: `${position}: ${labels.unknownCategory}`,
      tooltip: labels.unknownCategory,
    };
  }

  // The accessible name is the full category name, not `appearance.shortLabel`:
  // the 1–3 character abbreviation is the *visual* secondary encoding, and a
  // screen reader should not have to hear "IM" and look it up in the legend.
  const name = cell.label === undefined ? category.name : `${category.name} — ${cell.label}`;
  return { ariaLabel: `${position}: ${name}`, tooltip: name };
}

/**
 * Key that collapses every square sharing one resolved appearance.
 *
 * `kind` and `categoryId` are the discriminating fields: for a machine square
 * the other four are derived from the category the id names, and for empty/void
 * they are fixed by the theme and the kind. A per-square `label` is deliberately
 * NOT part of the key — it changes the square's accessible name (which
 * `describeCell` derives from the cell) but never how the square is drawn.
 *
 * On a validated plan this yields at most `maxCategories + 3` entries.
 */
function appearanceKey(appearance: CellAppearance): string {
  return `${appearance.kind}\u0000${appearance.categoryId ?? ""}`;
}

/**
 * Appearance table builder: interns `CellAppearance` values by their shared
 * fields and hands back a stable index for each.
 */
class AppearanceTable {
  private readonly byKey = new Map<string, number>();

  readonly appearances: CellAppearance[] = [];

  intern(appearance: CellAppearance): number {
    const key = appearanceKey(appearance);
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      // The FIRST resolved appearance for a key wins. Two categories with the
      // same colour/label/pattern would otherwise flip a square's colour
      // depending on paint order; with this rule it is deterministic.
      return existing;
    }
    const index = this.appearances.length;
    this.byKey.set(key, index);
    this.appearances.push(appearance);
    return index;
  }
}

/**
 * Reads ONE square's appearance without building the whole model.
 *
 * Kept for callers that need a single square (a hover card, a print header) and
 * for the accessible strings: the packed model stores appearances, so the
 * position-dependent `ariaLabel`/`tooltip` are not in it. Prefer
 * `buildFloorRenderModel(...).appearanceAt` / `.describeCell` when a caller
 * already has a model — this function re-walks the plan.
 *
 * Throws `out-of-bounds` / `unknown-floor` rather than returning null, because
 * a caller that reached here named a concrete square.
 */
export function getCellAppearance(
  plan: GymFloorPlan,
  floorId: string,
  row: number,
  col: number,
  theme: FloorPlanTheme = DEFAULT_FLOOR_PLAN_THEME,
  labels: FloorPlanLabels = DEFAULT_FLOOR_PLAN_LABELS
): CellAppearance & { ariaLabel: string; tooltip: string } {
  const floor = requireFloor(plan, floorId);
  if (!Number.isInteger(row) || row < 0 || row >= floor.rows) {
    throw new FloorPlanError("out-of-bounds", `Row ${row} is outside floor "${floorId}".`);
  }
  if (!Number.isInteger(col) || col < 0 || col >= floor.cols) {
    throw new FloorPlanError("out-of-bounds", `Column ${col} is outside floor "${floorId}".`);
  }
  const cell = cellAt(floor, row, col);
  return {
    ...appearanceForCell(plan, cell, theme),
    ...describeAppearance(plan, cell, row, col, labels),
  };
}

/**
 * Legend entries for one floor: every category (including unused ones, so the
 * owner sees the full palette) plus the fixed void entry. Each entry carries
 * colour, short label, pattern and count, so the legend is not colour-only.
 */
export function buildLegend(
  plan: GymFloorPlan,
  floorId: string,
  theme: FloorPlanTheme = DEFAULT_FLOOR_PLAN_THEME,
  labels: FloorPlanLabels = DEFAULT_FLOOR_PLAN_LABELS
): LegendEntry[] {
  const floor = requireFloor(plan, floorId);
  const counts = new Map<string, number>();
  let voidCount = 0;

  for (const rowCells of floor.cells) {
    for (const cell of rowCells) {
      if (cell.kind === "machine") {
        counts.set(cell.categoryId, (counts.get(cell.categoryId) ?? 0) + 1);
      } else if (cell.kind === "void") {
        voidCount += 1;
      }
    }
  }

  const entries: LegendEntry[] = plan.categories.map((category) => ({
    kind: "category",
    id: category.id,
    name: category.name,
    color: category.color,
    inkColor: getInkColor(category.color),
    shortLabel: category.shortLabel,
    pattern: category.pattern,
    count: counts.get(category.id) ?? 0,
  }));

  entries.push({
    kind: "void",
    id: "__void__",
    name: labels.unavailable,
    color: theme.voidColor,
    inkColor: getInkColor(theme.voidColor),
    shortLabel: VOID_SHORT_LABEL,
    pattern: VOID_PATTERN,
    count: voidCount,
  });

  return entries;
}

/**
 * Plain-language summary used as the figure's alt text and as the screen-reader
 * description. Even a 40 × 40 grid is 1 600 squares — nobody wants to tab
 * through that, and 9 216 at the ceiling would be absurd — so the public view
 * is exposed as one image with this summary plus the legend, not as thousands
 * of focusable nodes.
 */
export function describeFloor(
  plan: GymFloorPlan,
  floorId: string,
  labels: FloorPlanLabels = DEFAULT_FLOOR_PLAN_LABELS
): string {
  const floor = requireFloor(plan, floorId);
  const counts = new Map<string, number>();
  let voidCount = 0;
  let emptyCount = 0;

  for (const rowCells of floor.cells) {
    for (const cell of rowCells) {
      if (cell.kind === "machine") {
        counts.set(cell.categoryId, (counts.get(cell.categoryId) ?? 0) + 1);
      } else if (cell.kind === "void") {
        voidCount += 1;
      } else {
        emptyCount += 1;
      }
    }
  }

  const equipment = plan.categories
    .filter((category) => (counts.get(category.id) ?? 0) > 0)
    .map((category) => `${counts.get(category.id) ?? 0} ${category.name}`)
    .join(", ");

  const equipmentText =
    equipment.length > 0 ? `${labels.equipment}: ${equipment}` : labels.noEquipment;

  return `${floor.name} — ${floor.rows} × ${floor.cols}. ${equipmentText}. ${voidCount} ${labels.unavailable}. ${emptyCount} ${labels.openFloor}.`;
}

/**
 * Builds the packed render model for one floor.
 *
 * One pass over the grid does all three jobs: read each cell, intern its shared
 * appearance, and write the 2-byte index. Nothing per-square is allocated
 * beyond the index array itself.
 *
 * `appearanceAt` and `describeCell` are O(1) closures over the floor and the
 * tables. They are methods on the returned object rather than free functions so
 * a renderer cannot accidentally pair one floor's index with another floor's
 * appearance table.
 */
export function buildFloorRenderModel(
  plan: GymFloorPlan,
  floorId: string,
  theme: FloorPlanTheme = DEFAULT_FLOOR_PLAN_THEME,
  labels: FloorPlanLabels = DEFAULT_FLOOR_PLAN_LABELS
): FloorRenderModel {
  const floor = requireFloor(plan, floorId);
  const cells = floor.rows * floor.cols;
  const cellAppearanceIndex = new Uint16Array(cells);
  const table = new AppearanceTable();

  for (let row = 0; row < floor.rows; row += 1) {
    for (let col = 0; col < floor.cols; col += 1) {
      cellAppearanceIndex[row * floor.cols + col] = table.intern(
        appearanceForCell(plan, cellAt(floor, row, col), theme)
      );
    }
  }

  const appearances = table.appearances;
  const { rows, cols } = floor;

  const inBounds = (row: number, col: number): boolean =>
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < rows &&
    col >= 0 &&
    col < cols;

  return {
    floorId: floor.id,
    floorName: floor.name,
    rows,
    cols,
    cellAppearanceIndex,
    appearances,
    legend: buildLegend(plan, floorId, theme, labels),
    summary: describeFloor(plan, floorId, labels),
    appearanceAt(row: number, col: number): CellAppearance | null {
      if (!inBounds(row, col)) return null;
      return appearances[cellAppearanceIndex[row * cols + col]] ?? null;
    },
    describeCell(row: number, col: number): { ariaLabel: string; tooltip: string } | null {
      if (!inBounds(row, col)) return null;
      if (appearances[cellAppearanceIndex[row * cols + col]] === undefined) return null;
      return describeAppearance(plan, cellAt(floor, row, col), row, col, labels);
    },
  };
}

/**
 * Re-exported so a consumer can assert the packed model's invariant (the
 * index array is exactly `rows * cols` wide and every entry addresses a real
 * appearance) without importing `FLOOR_PLAN_LIMITS` for it.
 *
 * Returns an empty list when the model is well formed.
 */
export function checkRenderModel(model: FloorRenderModel): string[] {
  const problems: string[] = [];
  const expected = model.rows * model.cols;
  if (model.cellAppearanceIndex.length !== expected) {
    problems.push(
      `cellAppearanceIndex has ${model.cellAppearanceIndex.length} entries; expected ${expected}.`
    );
  }
  if (model.appearances.length > FLOOR_PLAN_LIMITS.maxCategories + 3) {
    problems.push(
      `the floor has ${model.appearances.length} appearances; at most ${FLOOR_PLAN_LIMITS.maxCategories + 3} are possible.`
    );
  }
  for (let index = 0; index < model.cellAppearanceIndex.length; index += 1) {
    if (model.cellAppearanceIndex[index] >= model.appearances.length) {
      problems.push(
        `cellAppearanceIndex[${index}] = ${model.cellAppearanceIndex[index]} does not address any appearance.`
      );
      break;
    }
  }
  return problems;
}
