/**
 * Paint-stroke geometry.
 *
 * A pointer can move several cells between two `pointermove`/`pointerenter`
 * events, so a fast drag over a 40 × 40 plan would leave gaps. Filling the
 * segment with a Bresenham line makes the stroke continuous, which is what the
 * user draws — and `paintCells` still deduplicates the result.
 *
 * Kept pure and separate so the interpolation is testable without a DOM.
 */

import type { CellCoord, FloorCell } from "@/modules/gym-floor-plan";

/**
 * Every integer cell on the straight line from `from` to `to`, inclusive,
 * in order. Standard Bresenham: correct for horizontal, vertical and diagonal
 * lines, and symmetric enough for painting (the order only matters for dedupe).
 */
export function lineCells(from: CellCoord, to: CellCoord): CellCoord[] {
  const cells: CellCoord[] = [];
  let { row, col } = from;
  const targetRow = to.row;
  const targetCol = to.col;

  const deltaRow = Math.abs(targetRow - row);
  const deltaCol = Math.abs(targetCol - col);
  const stepRow = row < targetRow ? 1 : -1;
  const stepCol = col < targetCol ? 1 : -1;
  let error = deltaCol - deltaRow;

  // The loop always terminates: each iteration moves at least one axis toward
  // the target, and the target is reachable from integer coordinates.
  for (;;) {
    cells.push({ row, col });
    if (row === targetRow && col === targetCol) return cells;
    const doubled = error * 2;
    if (doubled > -deltaRow) {
      error -= deltaRow;
      col += stepCol;
    }
    if (doubled < deltaCol) {
      error += deltaCol;
      row += stepRow;
    }
  }
}

/**
 * Accumulates a stroke's cells, appending the segment from the previous point.
 * Returns a new map so React state comparisons stay cheap and predictable.
 */
export function addStrokePoint(
  cells: ReadonlyMap<string, CellCoord>,
  from: CellCoord | null,
  to: CellCoord
): Map<string, CellCoord> {
  const next = new Map(cells);
  const segment = from === null ? [to] : lineCells(from, to);
  for (const cell of segment) next.set(`${cell.row}:${cell.col}`, cell);
  return next;
}

/**
 * The `FloorCell` a brush writes, untyped here to avoid importing the editor's
 * Brush union into a pure module. `paintCells` validates the shape itself.
 */
export type StrokeCell = FloorCell;
