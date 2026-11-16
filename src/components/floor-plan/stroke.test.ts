import { describe, expect, it } from "vitest";
import { addStrokePoint, lineCells } from "@/components/floor-plan/stroke";
import {
  brushKey,
  brushToCell,
  brushesEqual,
  categoryBrush,
  ERASER_BRUSH,
  VOID_BRUSH,
} from "@/components/floor-plan/cellStyle";

describe("lineCells", () => {
  it("returns the single cell when the line is degenerate", () => {
    expect(lineCells({ row: 2, col: 3 }, { row: 2, col: 3 })).toEqual([{ row: 2, col: 3 }]);
  });

  it("walks a horizontal segment inclusively", () => {
    expect(lineCells({ row: 1, col: 1 }, { row: 1, col: 4 })).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
    ]);
  });

  it("walks a vertical segment downward and upward", () => {
    expect(lineCells({ row: 0, col: 0 }, { row: 2, col: 0 })).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]);
    expect(lineCells({ row: 2, col: 0 }, { row: 0, col: 0 })).toEqual([
      { row: 2, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: 0 },
    ]);
  });

  it("walks a perfect diagonal", () => {
    expect(lineCells({ row: 0, col: 0 }, { row: 3, col: 3 })).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
    ]);
  });

  it("fills a shallow diagonal without gaps (the reason it exists)", () => {
    const cells = lineCells({ row: 0, col: 0 }, { row: 1, col: 6 });
    // Every step is 8-connected: no jump of more than one row or column.
    for (let index = 1; index < cells.length; index += 1) {
      expect(Math.abs(cells[index].row - cells[index - 1].row)).toBeLessThanOrEqual(1);
      expect(Math.abs(cells[index].col - cells[index - 1].col)).toBeLessThanOrEqual(1);
    }
    expect(cells[0]).toEqual({ row: 0, col: 0 });
    expect(cells[cells.length - 1]).toEqual({ row: 1, col: 6 });
  });
});

describe("addStrokePoint", () => {
  it("starts a stroke with just the first point", () => {
    const cells = addStrokePoint(new Map(), null, { row: 4, col: 2 });
    expect([...cells.keys()]).toEqual(["4:2"]);
  });

  it("appends the segment from the previous point", () => {
    const first = addStrokePoint(new Map(), null, { row: 0, col: 0 });
    const second = addStrokePoint(first, { row: 0, col: 0 }, { row: 0, col: 2 });
    expect([...second.keys()].sort()).toEqual(["0:0", "0:1", "0:2"]);
  });

  it("deduplicates cells visited twice by an overlapping drag", () => {
    const first = addStrokePoint(new Map(), null, { row: 0, col: 0 });
    const second = addStrokePoint(first, { row: 0, col: 0 }, { row: 0, col: 2 });
    const third = addStrokePoint(second, { row: 0, col: 2 }, { row: 0, col: 0 });
    expect(third.size).toBe(3);
  });

  it("does not mutate the map it was given", () => {
    const first = addStrokePoint(new Map(), null, { row: 0, col: 0 });
    addStrokePoint(first, { row: 0, col: 0 }, { row: 0, col: 2 });
    expect(first.size).toBe(1);
  });
});

describe("brushes", () => {
  it("maps each brush to the cell it paints", () => {
    expect(brushToCell(ERASER_BRUSH)).toEqual({ kind: "empty" });
    expect(brushToCell(VOID_BRUSH)).toEqual({ kind: "void" });
    expect(brushToCell(categoryBrush("cat-2"))).toEqual({
      kind: "machine",
      categoryId: "cat-2",
    });
  });

  it("keys and compares brushes by kind and category", () => {
    expect(brushKey(ERASER_BRUSH)).toBe("empty");
    expect(brushKey(VOID_BRUSH)).toBe("void");
    expect(brushKey(categoryBrush("cat-1"))).toBe("machine:cat-1");
    expect(brushesEqual(categoryBrush("cat-1"), categoryBrush("cat-1"))).toBe(true);
    expect(brushesEqual(categoryBrush("cat-1"), categoryBrush("cat-2"))).toBe(false);
    expect(brushesEqual(ERASER_BRUSH, VOID_BRUSH)).toBe(false);
  });
});
