/**
 * Styles and brush helpers shared by the public display and the admin editor.
 *
 * ## What changed when the renderer became SVG
 *
 * The CSS-Grid renderer needed a style *per square*: `cellStyle(cell)` built a
 * background colour, an ink colour and a CSS pattern gradient for every one of
 * up to 9 216 `<div>`s. SVG draws a whole appearance as one path, so that work
 * moved into the pure scene builder (`renderSvg.ts`), which emits fill colours,
 * pattern defs and label tiles once per *appearance*. Keeping a second,
 * CSS-specific cell renderer alive next to it would have been two sources of
 * truth for the same square.
 *
 * Deleted with the CSS-Grid path: `gridContainerStyle` (there is no grid
 * container to template any more — the SVG viewBox does that job) and its
 * `GridTemplate` input.
 *
 * Kept, because they still have live consumers:
 *
 *   - `themeVariablesStyle` / `FLOOR_PLAN_THEME_CSS_VARIABLES` — the `--fp-*`
 *     custom properties the print stylesheet redefines and the SVG's grid lines
 *     and focus ring reference.
 *   - `CELL_BASE_STYLE` / `CELL_LABEL_FONT_SIZE` — `FloorPlanLegend`'s swatch is
 *     still a DOM square and shares the cell geometry with the map.
 *   - `cellStyle` — the editor's brush preview is a `CSSProperties` value it
 *     hands to `FloorPlanCanvas`; the SVG reads the one property it needs
 *     (`backgroundColor`) as the preview path's fill. See `strokePreviewFill`.
 *   - the brush helpers, `cellKey` and `clampToAxis`, which are model-side
 *     helpers that never had anything to do with CSS.
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
  type CellAppearance,
  type FloorPlanTheme,
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

/**
 * The brush to fall back to for a plan: its first category, or the eraser when
 * the plan has no categories at all.
 *
 * The editor needs this answer twice — once to seed its brush state and once to
 * repair a brush whose category was deleted underneath it — and both sites must
 * agree, or a fresh editor and a repaired one would behave differently.
 */
export function defaultBrush(categories: ReadonlyArray<{ id: string }>): Brush {
  return categories.length > 0 ? categoryBrush(categories[0].id) : ERASER_BRUSH;
}

/** The cell a brush writes. `paintCells` / `setCell` accept it directly. */
export function brushToCell(brush: Brush): FloorCellLike {
  if (brush.kind === "machine") return { kind: "machine", categoryId: brush.categoryId };
  return brush.kind === "void" ? { kind: "void" } : { kind: "empty" };
}

/**
 * The `FloorCell` shape `paintCells`/`setCell` accept.
 *
 * Declared structurally rather than imported so this module keeps compiling if
 * the addon's cell union is extended; the model validates the result anyway.
 */
export type FloorCellLike =
  { kind: "empty" } | { kind: "void" } | { kind: "machine"; categoryId: string; label?: string };

/** `"row:col"` key used to deduplicate a paint stroke. */
export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/**
 * Clamps a coordinate onto a floor `axisLength` squares long.
 *
 * The editor keeps a raw cursor position and corrects it on render instead of
 * repairing state in an effect (a floor or category can disappear underneath
 * it), so the same `Math.min(length - 1, Math.max(0, value))` appeared for both
 * axes in two places. Kept here so the "cursor never leaves the grid" rule is
 * stated once and is testable without a DOM.
 */
export function clampToAxis(value: number, axisLength: number): number {
  return Math.min(Math.max(0, value), Math.max(0, axisLength - 1));
}

/**
 * Font size for a short label inside a legend swatch.
 *
 * The map's own labels are sized in cell units by the SVG scene
 * (`LABEL_FONT_SIZE_RATIO`); this one only stays for the DOM swatch, which is a
 * fixed 22px chip.
 */
export const CELL_LABEL_FONT_SIZE = "clamp(8px, 1.4vmin, 14px)";

/** Swatch geometry shared by the legend chip and any DOM cell preview. */
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

/**
 * Appearance of the editor's brush-preview chip.
 *
 * The SVG canvas does not paint a per-square `<div>` any more, so this is no
 * longer a cell style — it is the swatch description the editor hands to the
 * canvas, and the canvas reads `backgroundColor` back out as a fill. `kind`
 * decides whether the theme variable or the category hex wins, exactly as the
 * committed square will look.
 */
export function cellStyle(
  cell: Pick<CellAppearance, "kind" | "color" | "inkColor" | "pattern">
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

/**
 * The fill the SVG should use for the editor's live stroke preview.
 *
 * `cellStyle` deliberately resolves empty/void to a `var(--fp-*)` reference so a
 * single stylesheet swap re-themes them; SVG *presentation attributes* do not
 * resolve `var()`, so the value is applied through a `style` object instead
 * (which does). A category colour is a plain hex and passes through unchanged.
 */
export function strokePreviewFill(style: CSSProperties | undefined): string {
  const background = style?.backgroundColor;
  return typeof background === "string" && background.length > 0 ? background : "transparent";
}
