/**
 * Gym floor plan — SVG scene builder (React-free, dependency-free).
 *
 * The CSS-Grid renderer created one DOM node per square: 1 600 at the old
 * 40 × 40 ceiling, 9 216 at the current 96 × 96 one. This module turns a
 * `FloorRenderModel` into a *drawable scene* instead: geometry, fills, pattern
 * tiles and the accessibility contract, with no React and no DOM access, so a
 * host can render it with React, with `innerHTML`, or not at all.
 *
 * Two rules shape the output:
 *
 *   1. **One shape per appearance, not per square.** The model is a row-major
 *      `cellAppearanceIndex` into a table of at most `maxCategories + 3`
 *      appearances. We walk that index once per appearance and emit a single
 *      run-merged path `d` string, merging horizontally adjacent squares. A
 *      floor therefore costs one `<path>` per *used* appearance — 23 in the
 *      worst case, a handful in practice — no matter whether it is 3 × 4 or
 *      96 × 96. No per-square object is ever allocated: the walk appends to one
 *      string per appearance.
 *
 *   2. **The map is one image to a screen reader.** The scene carries exactly
 *      one accessible name (the module's floor summary) and a plain-text legend
 *      mapping. It deliberately holds NO per-square labels, roles or tab stops;
 *      hover/focus text is derived on demand by `FloorRenderModel.describeCell`
 *      for the single square the editor has its cursor on. A 96 × 96 floor is
 *      one focus target, not 9 216.
 *
 * The third encoding channel (the 1–3 character short label) cannot be drawn
 * per square at large sizes — at 96 × 96 a label is a smear. Labels are emitted
 * only when the computed square is at least `SVG_LABEL_MIN_CELL_PX` wide, and
 * are drawn as a *pattern tile* (`<pattern>` containing one `<text>`) so even
 * when they are on the DOM stays O(appearances) instead of O(squares).
 */

import type {
  CellAppearance,
  CellCoord,
  CellPattern,
  FloorRenderModel,
  LegendEntry,
} from "./types";

/**
 * Minimum rendered size of one square, in CSS pixels, before the 1–3 character
 * machine label is drawn.
 *
 * Basis: the module's existing label rule is `clamp(8px, 1.4vmin, 14px)` — 8px
 * is the smallest size the design doc accepts as legible. The label is drawn at
 * half a square's height (`LABEL_FONT_SIZE_RATIO`), so an 8px glyph needs a
 * 16px square. Below 16px the label is a smear: we keep the fill and the
 * pattern and let the legend carry the mapping, which is the whole point of the
 * three-channel encoding.
 */
export const SVG_LABEL_MIN_CELL_PX = 16;

/**
 * Label cap height as a fraction of one square. 0.5 keeps a three-character
 * label inside its square (`3 × 0.5 × 0.6 ≈ 0.9` of the cell width).
 */
export const LABEL_FONT_SIZE_RATIO = 0.5;

/**
 * Pattern ink opacity. Patterns are the tertiary channel: visible on a 16px
 * square without competing with the fill, which stays the primary cue.
 */
export const PATTERN_INK_OPACITY = 0.45;

/**
 * The model's existing `CellCoord`, re-exported so a consumer of this module
 * does not have to import from two places. It is the same type, not a copy: a
 * second structurally-identical declaration in this file collided with `./types`
 * through the module barrel.
 */
export type { CellCoord };

/** The rectangle an SVG element occupies on screen, in CSS pixels. */
export interface SvgViewportBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A path inside a `<pattern>` tile. Coordinates are in cell units. */
export type SvgTileShape =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; strokeWidth: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "path"; d: string; strokeWidth: number };

/**
 * A `<pattern>` def for one appearance's fill. The tile is measured in cell
 * units (1 unit = one square), so it scales with the grid automatically.
 */
export interface SvgPatternTile {
  /** Unique across the page — includes the floor id. */
  id: string;
  appearanceIndex: number;
  kind: CellAppearance["kind"];
  backgroundColor: string;
  width: number;
  height: number;
  /** Stroke/fill colour for the tile shapes (the appearance's contrast ink). */
  inkColor: string;
  opacity: number;
  shapes: readonly SvgTileShape[];
}

/**
 * A `<pattern>` def that stamps one short label into every square it fills.
 * A tile is 1 × 1 cell, so the label lands centred in each square.
 */
export interface SvgLabelTile {
  id: string;
  appearanceIndex: number;
  kind: CellAppearance["kind"];
  text: string;
  inkColor: string;
  /** Font size in cell units; see `LABEL_FONT_SIZE_RATIO`. */
  fontSize: number;
}

/** One drawable layer: everything sharing an appearance, drawn once. */
export interface SvgAppearanceLayer {
  appearanceIndex: number;
  kind: CellAppearance["kind"];
  categoryId: string | null;
  /** Owner-defined (machine) or theme-derived (empty/void) fill colour. */
  color: string;
  inkColor: string;
  shortLabel: string;
  pattern: CellPattern;
  /** Value for the element's `fill`: a hex colour, or `url(#…)`. */
  fill: string;
  /**
   * Run-merged path data. One `M…h{w}v1h-{w}z` sub-path per horizontal run of
   * adjacent squares of this appearance, in reading order.
   */
  d: string;
  /** Number of squares covered by `d`. */
  squareCount: number;
  /** Number of sub-paths in `d` (always <= `squareCount`). */
  runCount: number;
}

/** A label layer: one path per labelled appearance, filled by a label tile. */
export interface SvgLabelLayer {
  appearanceIndex: number;
  fill: string;
  d: string;
  squareCount: number;
}

/**
 * The accessibility contract, carried as data so every host renders the same
 * one:
 *
 *   - `label` is the accessible name of the map (the module's floor summary).
 *     It is the ONLY place the summary appears — a renderer must not also put
 *     it on a wrapper, or a screen reader hears it twice.
 *   - `description` is the legend mapping in words, for `<desc>`/help text.
 *   - `perSquareLabels` is always `false`: the map is one image, never 9 216
 *     labelled nodes.
 */
export interface SvgAccessibility {
  role: "img" | "group";
  label: string;
  description: string;
  /** Human-readable legend mapping, `"IM Impulse machines · × unavailable"`. */
  legendText: string;
  perSquareLabels: false;
}

/** Everything a component needs to draw one floor. */
export interface SvgScene {
  floorId: string;
  floorName: string;
  rows: number;
  cols: number;
  /** `"0 0 <cols> <rows>"`: one user unit per square. */
  viewBox: string;
  /** Width / height ratio that keeps squares square. */
  aspectRatio: number;
  /** Rendered size of one square at the requested width, in CSS pixels. */
  cellPx: number;
  /** Whether the short labels are drawn at this size. */
  showLabels: boolean;
  accessibility: SvgAccessibility;
  /** One merged path of every internal grid line, drawn with a hairline stroke. */
  gridLines: string;
  /** Pattern defs; empty when no appearance uses a non-solid pattern. */
  patterns: readonly SvgPatternTile[];
  /** Label defs; empty when `showLabels` is false. */
  labelTiles: readonly SvgLabelTile[];
  /** Fill layers, in appearance order. */
  layers: readonly SvgAppearanceLayer[];
  /** Label layers drawn on top of the fills; empty when `showLabels` is false. */
  labelLayers: readonly SvgLabelLayer[];
}

export interface SvgSceneOptions {
  /**
   * Rendered width of the map in CSS pixels, used only to decide whether the
   * square is big enough for a label. Default 720 (the plan's content column on
   * a laptop). The scene never hard-codes a width in the markup.
   */
  widthPx?: number;
  /** Prefix for pattern ids so two plans on one page cannot collide. */
  idPrefix?: string;
  /** Override the label threshold; defaults to `SVG_LABEL_MIN_CELL_PX`. */
  labelMinCellPx?: number;
}

/** `"0 0 cols rows"` — the viewBox that makes one user unit one square. */
export function viewBoxFor(rows: number, cols: number): string {
  return `0 0 ${cols} ${rows}`;
}

/** Width / height ratio of the plan, for the container's `aspect-ratio`. */
export function floorAspectRatio(rows: number, cols: number): number {
  return cols / rows;
}

/**
 * Run-merged path data for every square whose appearance is `appearanceIndex`.
 *
 * Row-major walk with horizontal merging: adjacent squares of the same
 * appearance become one `h{w}v1h-{w}z` sub-path, so a painted block costs one
 * run instead of one rectangle per square. Only a checkerboard degenerates to
 * one run per square, and even then the cost is a string, not an object graph.
 */
export function appearancePath(
  index: Uint16Array,
  rows: number,
  cols: number,
  appearanceIndex: number
): { d: string; squareCount: number; runCount: number } {
  let d = "";
  let squareCount = 0;
  let runCount = 0;

  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    while (col < cols) {
      const offset = row * cols + col;
      if (index[offset] !== appearanceIndex) {
        col += 1;
        continue;
      }
      // Extend the run while the next square on this row matches.
      const start = col;
      let end = col + 1;
      while (end < cols && index[row * cols + end] === appearanceIndex) end += 1;
      const width = end - start;
      d += `M${start} ${row}h${width}v1h-${width}z`;
      squareCount += width;
      runCount += 1;
      col = end;
    }
  }

  return { d, squareCount, runCount };
}

/**
 * Run-merged path data for an explicit set of squares (the editor's live
 * stroke preview). Sorts and merges per row, so a dragged line costs a few
 * sub-paths rather than one per square.
 */
export function cellSetPath(
  cells: Iterable<CellCoord>,
  rows: number,
  cols: number
): { d: string; squareCount: number; runCount: number } {
  const byRow = new Map<number, number[]>();

  for (const { row, col } of cells) {
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
    const rowCols = byRow.get(row);
    if (rowCols === undefined) byRow.set(row, [col]);
    else rowCols.push(col);
  }

  let d = "";
  let squareCount = 0;
  let runCount = 0;

  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const rowCols = byRow.get(row) ?? [];
    rowCols.sort((a, b) => a - b);
    let cursor = 0;
    while (cursor < rowCols.length) {
      const start = rowCols[cursor];
      let end = start + 1;
      let next = cursor + 1;
      while (next < rowCols.length && rowCols[next] <= end) {
        end = Math.max(end, rowCols[next] + 1);
        next += 1;
      }
      const width = end - start;
      d += `M${start} ${row}h${width}v1h-${width}z`;
      squareCount += width;
      runCount += 1;
      cursor = next;
    }
  }

  return { d, squareCount, runCount };
}

/** Pattern geometry for one appearance, in cell units. `null` means solid. */
function patternTile(
  pattern: CellPattern,
  kind: CellAppearance["kind"],
  backgroundColor: string,
  inkColor: string,
  id: string,
  appearanceIndex: number
): SvgPatternTile | null {
  const strokeWidth = 0.05;

  switch (pattern) {
    case "solid":
      return null;
    case "diagonal":
      // A 45° tangent per 0.4-cell tile repeats into continuous stripes.
      return {
        id,
        appearanceIndex,
        kind,
        backgroundColor,
        width: 0.4,
        height: 0.4,
        inkColor,
        opacity: PATTERN_INK_OPACITY,
        shapes: [{ kind: "line", x1: 0, y1: 0.4, x2: 0.4, y2: 0, strokeWidth }],
      };
    case "dots":
      return {
        id,
        appearanceIndex,
        kind,
        backgroundColor,
        width: 0.3,
        height: 0.3,
        inkColor,
        opacity: PATTERN_INK_OPACITY,
        shapes: [{ kind: "circle", cx: 0.15, cy: 0.15, r: 0.055 }],
      };
    case "grid":
      return {
        id,
        appearanceIndex,
        kind,
        backgroundColor,
        width: 0.5,
        height: 0.5,
        inkColor,
        opacity: PATTERN_INK_OPACITY,
        shapes: [
          { kind: "path", d: "M0 0H0.5", strokeWidth: 0.04 },
          { kind: "path", d: "M0 0V0.5", strokeWidth: 0.04 },
        ],
      };
    case "cross":
      // One saltire per square: the tile is exactly the cell.
      return {
        id,
        appearanceIndex,
        kind,
        backgroundColor,
        width: 1,
        height: 1,
        inkColor,
        opacity: PATTERN_INK_OPACITY,
        shapes: [
          { kind: "path", d: "M0.2 0.2L0.8 0.8", strokeWidth: 0.06 },
          { kind: "path", d: "M0.8 0.2L0.2 0.8", strokeWidth: 0.06 },
        ],
      };
  }
}

/** The legend mapping in one line: `"IM Impulse machines · × unavailable"`. */
export function legendToText(legend: readonly LegendEntry[]): string {
  return legend.map((entry) => `${entry.shortLabel} ${entry.name}`.trim()).join(" · ");
}

/**
 * Path data for every internal grid line, as ONE path.
 *
 * Drawn with a hairline `vector-effect="non-scaling-stroke"` stroke, so the
 * lines stay 1px on screen at 96 × 96 instead of thinning to nothing. Grid
 * lines are a separate path rather than 192 strokes so the whole grid costs one
 * element.
 */
export function gridLinePath(rows: number, cols: number): string {
  let d = "";
  for (let col = 1; col < cols; col += 1) d += `M${col} 0v${rows}`;
  for (let row = 1; row < rows; row += 1) d += `M0 ${row}h${cols}`;
  return d;
}

function requireShape(model: FloorRenderModel): void {
  if (!Number.isInteger(model.rows) || model.rows < 1) {
    throw new RangeError(`rows must be a positive integer, got ${String(model.rows)}.`);
  }
  if (!Number.isInteger(model.cols) || model.cols < 1) {
    throw new RangeError(`cols must be a positive integer, got ${String(model.cols)}.`);
  }
  const expected = model.rows * model.cols;
  if (model.cellAppearanceIndex.length !== expected) {
    throw new RangeError(
      `cellAppearanceIndex must hold rows*cols (${expected}) entries, got ` +
        `${model.cellAppearanceIndex.length}.`
    );
  }
}

/**
 * Builds the drawable scene for one floor.
 *
 * Cost is O(appearances × squares) time and O(appearances + runs) memory: the
 * index array is walked once per appearance, and each walk appends to one
 * string. No array of per-square objects is ever created.
 */
export function buildSvgScene(model: FloorRenderModel, options: SvgSceneOptions = {}): SvgScene {
  requireShape(model);

  const { rows, cols } = model;
  const widthPx = options.widthPx ?? 720;
  const idPrefix = options.idPrefix ?? `fp-${model.floorId}`;
  const labelMinCellPx = options.labelMinCellPx ?? SVG_LABEL_MIN_CELL_PX;

  // The map is laid out to fill the width, so the column height follows from
  // the plan's own proportions; `meet` then keeps squares square.
  const cellPx = widthPx / cols;
  const showLabels = cellPx >= labelMinCellPx;

  const patterns: SvgPatternTile[] = [];
  const labelTiles: SvgLabelTile[] = [];
  const layers: SvgAppearanceLayer[] = [];
  const labelLayers: SvgLabelLayer[] = [];

  for (let appearanceIndex = 0; appearanceIndex < model.appearances.length; appearanceIndex += 1) {
    const appearance = model.appearances[appearanceIndex];
    const geometry = appearancePath(model.cellAppearanceIndex, rows, cols, appearanceIndex);
    // An appearance nothing references (a deleted category, say) draws nothing.
    if (geometry.squareCount === 0) continue;

    const patternId = `${idPrefix}-pattern-${appearanceIndex}`;
    const tile = patternTile(
      appearance.pattern,
      appearance.kind,
      appearance.color,
      appearance.inkColor,
      patternId,
      appearanceIndex
    );
    if (tile !== null) patterns.push(tile);

    layers.push({
      appearanceIndex,
      kind: appearance.kind,
      categoryId: appearance.categoryId,
      color: appearance.color,
      inkColor: appearance.inkColor,
      shortLabel: appearance.shortLabel,
      pattern: appearance.pattern,
      fill: tile === null ? appearance.color : `url(#${patternId})`,
      d: geometry.d,
      squareCount: geometry.squareCount,
      runCount: geometry.runCount,
    });

    if (showLabels && appearance.shortLabel !== "") {
      const labelId = `${idPrefix}-label-${appearanceIndex}`;
      labelTiles.push({
        id: labelId,
        appearanceIndex,
        kind: appearance.kind,
        text: appearance.shortLabel,
        inkColor: appearance.inkColor,
        fontSize: LABEL_FONT_SIZE_RATIO,
      });
      labelLayers.push({
        appearanceIndex,
        fill: `url(#${labelId})`,
        d: geometry.d,
        squareCount: geometry.squareCount,
      });
    }
  }

  const legendText = legendToText(model.legend);

  return {
    floorId: model.floorId,
    floorName: model.floorName,
    rows,
    cols,
    viewBox: viewBoxFor(rows, cols),
    aspectRatio: floorAspectRatio(rows, cols),
    cellPx,
    showLabels,
    accessibility: {
      role: "img",
      // The summary lives here and ONLY here: a renderer that also puts it on a
      // wrapper makes a screen reader announce the floor twice.
      label: model.summary,
      description: legendText,
      legendText,
      perSquareLabels: false,
    },
    gridLines: gridLinePath(rows, cols),
    patterns,
    labelTiles,
    layers,
    labelLayers,
  };
}

/**
 * Maps a pointer position to a square, or `null` when it is outside the grid.
 *
 * This is the whole hit-testing story: the editor attaches ONE `pointerdown` /
 * `pointermove` handler to the `<svg>`, passes `getBoundingClientRect()` and the
 * event's client coordinates here, and paints `(row, col)`. There is no
 * per-square listener and no per-square DOM node.
 *
 * The maths mirrors `preserveAspectRatio="xMidYMid meet"`: the viewBox is scaled
 * by the smaller of the two axis ratios and centred, so a container that is not
 * exactly `cols / rows` letterboxes instead of stretching. Dividing by the
 * scaled size (not the element size) is what keeps the top-left and
 * bottom-right extremes exact on an off-ratio container.
 */
export function cellAtPoint(
  clientX: number,
  clientY: number,
  box: SvgViewportBox,
  rows: number,
  cols: number
): CellCoord | null {
  if (rows < 1 || cols < 1) return null;
  if (box.width <= 0 || box.height <= 0) return null;
  // A non-finite pointer coordinate is not "outside the grid" by the bounds
  // test below — `Math.floor(NaN)` is NaN, and both `< 0` and `>= cols` are
  // false for NaN — so it has to be rejected explicitly or it reaches
  // `paintCells` as a bogus square.
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  const scale = Math.min(box.width / cols, box.height / rows);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const contentWidth = cols * scale;
  const contentHeight = rows * scale;
  const originX = box.left + (box.width - contentWidth) / 2;
  const originY = box.top + (box.height - contentHeight) / 2;

  const col = Math.floor((clientX - originX) / scale);
  const row = Math.floor((clientY - originY) / scale);

  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  return { row, col };
}
