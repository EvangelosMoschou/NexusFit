/**
 * Gym floor plan — pure presentation helpers.
 *
 * Rendering is intentionally split from the model: `buildFloorRenderModel`
 * turns a plan + floor into a row-major list of cells, a CSS Grid template, a
 * legend and a screen-reader summary. A React component then only maps over
 * that data — no layout maths, no colour parsing and no accessibility logic in
 * JSX. An SVG or canvas renderer could consume the same model later.
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
  type GridTemplate,
  type GymFloorPlan,
  type LegendEntry,
  type PatternBackground,
  type RenderedCell,
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

/**
 * CSS Grid template that keeps squares square at any container width.
 * `minmax(0, 1fr)` is important: without it, long labels force grid tracks
 * wider than 1fr and the plan stops being a uniform grid.
 */
export function getGridTemplate(rows: number, cols: number): GridTemplate {
  if (
    !Number.isInteger(rows) ||
    rows < FLOOR_PLAN_LIMITS.minRows ||
    rows > FLOOR_PLAN_LIMITS.maxRows
  ) {
    throw new FloorPlanError(
      "invalid-dimensions",
      `rows must be an integer between ${FLOOR_PLAN_LIMITS.minRows} and ${FLOOR_PLAN_LIMITS.maxRows}.`
    );
  }
  if (
    !Number.isInteger(cols) ||
    cols < FLOOR_PLAN_LIMITS.minCols ||
    cols > FLOOR_PLAN_LIMITS.maxCols
  ) {
    throw new FloorPlanError(
      "invalid-dimensions",
      `cols must be an integer between ${FLOOR_PLAN_LIMITS.minCols} and ${FLOOR_PLAN_LIMITS.maxCols}.`
    );
  }
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    aspectRatio: `${cols} / ${rows}`,
  };
}

function requireFloor(plan: GymFloorPlan, floorId: string): Floor {
  const floor = findFloor(plan, floorId);
  if (!floor) {
    throw new FloorPlanError("unknown-floor", `No floor with id "${floorId}".`);
  }
  return floor;
}

function appearanceForCell(
  plan: GymFloorPlan,
  cell: Floor["cells"][number][number],
  row: number,
  col: number,
  theme: FloorPlanTheme,
  labels: FloorPlanLabels
): CellAppearance {
  const position = `${labels.row} ${row + 1}, ${labels.column} ${col + 1}`;

  if (cell.kind === "empty") {
    return {
      kind: "empty",
      categoryId: null,
      color: theme.emptyColor,
      inkColor: getInkColor(theme.emptyColor),
      shortLabel: "",
      pattern: "solid",
      ariaLabel: `${position}: ${labels.openFloor}`,
      tooltip: labels.openFloor,
    };
  }

  if (cell.kind === "void") {
    return {
      kind: "void",
      categoryId: null,
      color: theme.voidColor,
      inkColor: getInkColor(theme.voidColor),
      shortLabel: "×",
      pattern: "diagonal",
      ariaLabel: `${position}: ${labels.unavailable}`,
      tooltip: labels.unavailable,
    };
  }

  const category = plan.categories.find((candidate) => candidate.id === cell.categoryId);
  if (!category) {
    // Validation rejects this, but a renderer should never crash on bad data.
    return {
      kind: "machine",
      categoryId: cell.categoryId,
      color: "#DC2626",
      inkColor: getInkColor("#DC2626"),
      shortLabel: "?",
      pattern: "cross",
      ariaLabel: `${position}: ${labels.unknownCategory}`,
      tooltip: labels.unknownCategory,
    };
  }

  const name = cell.label === undefined ? category.name : `${category.name} — ${cell.label}`;
  return {
    kind: "machine",
    categoryId: category.id,
    color: category.color,
    inkColor: getInkColor(category.color),
    shortLabel: category.shortLabel,
    pattern: category.pattern,
    ariaLabel: `${position}: ${name}`,
    tooltip: name,
  };
}

export function getCellAppearance(
  plan: GymFloorPlan,
  floorId: string,
  row: number,
  col: number,
  theme: FloorPlanTheme = DEFAULT_FLOOR_PLAN_THEME,
  labels: FloorPlanLabels = DEFAULT_FLOOR_PLAN_LABELS
): CellAppearance {
  const floor = requireFloor(plan, floorId);
  if (!Number.isInteger(row) || row < 0 || row >= floor.rows) {
    throw new FloorPlanError("out-of-bounds", `Row ${row} is outside floor "${floorId}".`);
  }
  if (!Number.isInteger(col) || col < 0 || col >= floor.cols) {
    throw new FloorPlanError("out-of-bounds", `Column ${col} is outside floor "${floorId}".`);
  }
  const cell = floor.cells[row]?.[col] ?? { kind: "empty" as const };
  return appearanceForCell(plan, cell, row, col, theme, labels);
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
    shortLabel: "×",
    pattern: "diagonal",
    count: voidCount,
  });

  return entries;
}

/**
 * Plain-language summary used as the figure's alt text and as the screen-reader
 * description. A 40 × 40 grid is 1 600 squares — nobody wants to tab through
 * that, so the public view is exposed as one image with this summary plus the
 * legend, not as 1 600 focusable nodes.
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

export function buildFloorRenderModel(
  plan: GymFloorPlan,
  floorId: string,
  theme: FloorPlanTheme = DEFAULT_FLOOR_PLAN_THEME,
  labels: FloorPlanLabels = DEFAULT_FLOOR_PLAN_LABELS
): FloorRenderModel {
  const floor = requireFloor(plan, floorId);
  const cells: RenderedCell[] = [];

  for (let row = 0; row < floor.rows; row += 1) {
    for (let col = 0; col < floor.cols; col += 1) {
      const cell = floor.cells[row]?.[col] ?? { kind: "empty" as const };
      cells.push({
        row,
        col,
        ...appearanceForCell(plan, cell, row, col, theme, labels),
      });
    }
  }

  return {
    floorId: floor.id,
    floorName: floor.name,
    rows: floor.rows,
    cols: floor.cols,
    grid: getGridTemplate(floor.rows, floor.cols),
    cells,
    legend: buildLegend(plan, floorId, theme, labels),
    summary: describeFloor(plan, floorId, labels),
  };
}
