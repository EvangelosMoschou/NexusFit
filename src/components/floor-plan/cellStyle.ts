/**
 * Styles and brush helpers shared by the public display and the admin editor.
 *
 * The floor-plan module hands back resolved colours and CSS Grid templates
 * (`buildFloorRenderModel`), never React elements, so this file is the one place
 * that turns that data into inline styles. Keeping it out of the components
 * means the public figure and the editor grid paint identical squares.
 *
 * Theme-derived colours are read through CSS custom properties (`--fp-empty`,
 * `--fp-void`, `--fp-grid-line`, `--fp-ink`) instead of literal hex values. The
 * print stylesheet overrides those variables inside `@media print`, which is
 * what lets one DOM tree switch to `PRINT_FLOOR_PLAN_THEME` without rendering a
 * second copy of every floor. Owner-defined category colours stay literal: they
 * are data, not theme.
 */

import type { CSSProperties } from "react";
import {
  patternToBackground,
  type FloorCell,
  type FloorPlanTheme,
  type RenderedCell,
} from "@/modules/gym-floor-plan";

/**
 * Custom properties that carry the resolved theme down to every cell.
 *
 * Declaring them once on the plan's root means cells reference variables
 * instead of repeating hex literals, and `@media print` can swap the palette by
 * redefining six properties (see `FloorPlanPrintStyles`).
 */
export const FLOOR_PLAN_THEME_CSS_VARIABLES = {
  surface: "--fp-surface",
  empty: "--fp-empty",
  gridLine: "--fp-grid-line",
  void: "--fp-void",
  ink: "--fp-ink",
  mutedInk: "--fp-muted-ink",
} as const;

/** Root style exposing a `FloorPlanTheme` as the `--fp-*` custom properties. */
export function themeVariablesStyle(theme: FloorPlanTheme): CSSProperties {
  const variables: Record<string, string> = {
    [FLOOR_PLAN_THEME_CSS_VARIABLES.surface]: theme.surfaceColor,
    [FLOOR_PLAN_THEME_CSS_VARIABLES.empty]: theme.emptyColor,
    [FLOOR_PLAN_THEME_CSS_VARIABLES.gridLine]: theme.gridLineColor,
    [FLOOR_PLAN_THEME_CSS_VARIABLES.void]: theme.voidColor,
    [FLOOR_PLAN_THEME_CSS_VARIABLES.ink]: theme.inkColor,
    [FLOOR_PLAN_THEME_CSS_VARIABLES.mutedInk]: theme.mutedInkColor,
  };
  return variables as CSSProperties;
}

/** Active painting tool: a category, the eraser, or the fixed void brush. */
export type Brush = { kind: "empty" } | { kind: "void" } | { kind: "machine"; categoryId: string };

export const ERASER_BRUSH: Brush = { kind: "empty" };
export const VOID_BRUSH: Brush = { kind: "void" };

export function categoryBrush(categoryId: string): Brush {
  return { kind: "machine", categoryId };
}

/** Stable key for React lists and for `aria-pressed` comparisons. */
export function brushKey(brush: Brush): string {
  return brush.kind === "machine" ? `machine:${brush.categoryId}` : brush.kind;
}

export function brushesEqual(a: Brush, b: Brush): boolean {
  return brushKey(a) === brushKey(b);
}

/** The cell a brush writes. `paintCells` / `setCell` accept it directly. */
export function brushToCell(brush: Brush): FloorCell {
  if (brush.kind === "machine") return { kind: "machine", categoryId: brush.categoryId };
  return brush.kind === "void" ? { kind: "void" } : { kind: "empty" };
}

/** `"row:col"` key used to deduplicate a paint stroke. */
export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/**
 * Design doc §4: labels scale with the viewport but never drop below 8px or
 * grow past 14px, so a 40 × 40 plan stays readable without pan/zoom.
 */
export const CELL_LABEL_FONT_SIZE = "clamp(8px, 1.4vmin, 14px)";

/** Cells share one geometry rule in both views (square, clipped, centred). */
export const CELL_BASE_STYLE: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: CELL_LABEL_FONT_SIZE,
  lineHeight: 1,
  fontWeight: 700,
  userSelect: "none",
};

/** CSS Grid container style from `buildFloorRenderModel(...).grid`. */
export function gridContainerStyle(grid: {
  gridTemplateColumns: string;
  gridTemplateRows: string;
  aspectRatio: string;
}): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: grid.gridTemplateColumns,
    gridTemplateRows: grid.gridTemplateRows,
    aspectRatio: grid.aspectRatio,
    width: "100%",
    gap: 1,
    backgroundColor: "var(--fp-grid-line)",
    border: "1px solid var(--fp-grid-line)",
  };
}

/**
 * Appearance of one square.
 *
 * Empty and void squares follow the theme variables so print can restyle them;
 * machine squares use their category colour, which is owner data. The pattern is
 * drawn in the cell's contrast ink so it survives greyscale and photocopies
 * (design doc §6).
 */
export function cellStyle(
  cell: Pick<RenderedCell, "kind" | "color" | "inkColor" | "pattern">
): CSSProperties {
  const background =
    cell.kind === "empty"
      ? "var(--fp-empty)"
      : cell.kind === "void"
        ? "var(--fp-void)"
        : cell.color;
  const ink = cell.kind === "machine" ? cell.inkColor : "var(--fp-ink)";
  const pattern = patternToBackground(cell.pattern, cell.inkColor);

  return {
    ...CELL_BASE_STYLE,
    backgroundColor: background,
    color: ink,
    backgroundImage: pattern.backgroundImage,
    ...(pattern.backgroundSize === undefined ? {} : { backgroundSize: pattern.backgroundSize }),
  };
}
