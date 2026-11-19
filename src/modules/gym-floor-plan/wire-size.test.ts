/**
 * Wire-size measurements for schema v2.
 *
 * These are regression tests, not marketing numbers: the point is that the
 * run-length format stays an order of magnitude smaller than the dense v1 shape
 * on realistic, mostly-empty plans, and does not regress catastrophically on the
 * worst case (every square a machine).
 *
 * The "v1" figures are produced from the same plans by re-encoding every cell as
 * a v1 cell object, which is exactly what `serializePlan` wrote before schema v2
 * (`{"kind":"empty"}`, `{"kind":"machine","categoryId":"cat-1"}`). v1 category
 * ids are the `cat-N` strings, so the comparison includes the id repetition v2
 * removed.
 */

import { describe, expect, it } from "vitest";
import { addCategory, addFloor, createEmptyPlan, serializePlan, setCell } from "./model";
import { FLOOR_PLAN_LIMITS, type FloorCell, type GymFloorPlan } from "./types";

/** Builds `floors` floors of `rows x cols`, every square the same cell. */
function uniformPlan(
  rows: number,
  cols: number,
  floors: number,
  cell: FloorCell,
  options: { sparse?: boolean } = {}
): GymFloorPlan {
  let plan = createEmptyPlan({ rows, cols, title: "Measurement" });
  plan = addCategory(plan, { id: "cat-1", name: "Impulse machines", color: "#2563eb" });
  for (let index = 2; index <= floors; index += 1) {
    plan = addFloor(plan, { id: `floor-${index}`, name: `Floor ${index}`, rows, cols });
  }
  for (let index = 1; index <= floors; index += 1) {
    const floorId = `floor-${index}`;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        // Sparse: leave a walkable margin and paint a block of equipment.
        if (options.sparse && !(row >= 2 && row < 6 && col >= 2 && col < 6)) continue;
        plan = setCell(plan, floorId, row, col, cell);
      }
    }
  }
  return plan;
}

/** The exact JSON schema v1 wrote: dense cell objects, category ids by string. */
function serializeV1(plan: GymFloorPlan): string {
  const canonical = {
    schemaVersion: 1,
    title: plan.title,
    categories: plan.categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      shortLabel: category.shortLabel,
      pattern: category.pattern,
    })),
    floors: plan.floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      rows: floor.rows,
      cols: floor.cols,
      cells: floor.cells.map((rowCells) =>
        rowCells.map((cell) => {
          if (cell.kind === "empty") return { kind: "empty" };
          if (cell.kind === "void") return { kind: "void" };
          return cell.label === undefined
            ? { kind: "machine", categoryId: cell.categoryId }
            : { kind: "machine", categoryId: cell.categoryId, label: cell.label };
        })
      ),
    })),
  };
  return JSON.stringify(canonical);
}

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function measure(plan: GymFloorPlan): { v1: number; v2: number; ratio: number } {
  const v1 = bytes(serializeV1(plan));
  const v2 = bytes(serializePlan(plan));
  return { v1, v2, ratio: v1 / v2 };
}

const MACHINE: FloorCell = { kind: "machine", categoryId: "cat-1" };
const EMPTY: FloorCell = { kind: "empty" };

describe("schema v2 wire size", () => {
  it("shrinks the default 12 x 12 plan", () => {
    const { v1, v2, ratio } = measure(uniformPlan(12, 12, 1, EMPTY));
    console.warn(`12x12 empty: v1=${v1}B v2=${v2}B ratio=${ratio.toFixed(1)}x`);

    expect(ratio).toBeGreaterThan(5);
  });

  it("shrinks a single 40 x 40 all-machine floor", () => {
    const { v1, v2, ratio } = measure(uniformPlan(40, 40, 1, MACHINE));
    console.warn(`40x40 all-machine: v1=${v1}B v2=${v2}B ratio=${ratio.toFixed(1)}x`);

    expect(v2).toBeLessThan(v1);
  });

  it("shrinks the worst-case 40 x 40 x 6 all-machine plan", () => {
    const { v1, v2, ratio } = measure(uniformPlan(40, 40, 6, MACHINE));
    console.warn(`40x40x6 all-machine: v1=${v1}B v2=${v2}B ratio=${ratio.toFixed(1)}x`);

    // Machine cells are one token each in both formats; the win is the category
    // id -> index change, so the floor here is a modest but real reduction.
    expect(v2).toBeLessThan(v1);
  });

  it("shrinks the all-empty 40 x 40 x 6 plan by roughly an order of magnitude", () => {
    const { v1, v2, ratio } = measure(uniformPlan(40, 40, 6, EMPTY));
    console.warn(`40x40x6 empty: v1=${v1}B v2=${v2}B ratio=${ratio.toFixed(1)}x`);

    expect(ratio).toBeGreaterThan(40);
  });

  it("keeps the largest possible plan well inside a config blob", () => {
    // Six maximal floors where every square is a labelled machine: the true
    // worst case for the module's limits. Read straight off the constants, so
    // raising the ceiling cannot leave this test measuring a smaller plan than
    // the module actually allows.
    const size = FLOOR_PLAN_LIMITS.maxRows;
    const labelled: FloorCell = { kind: "machine", categoryId: "cat-1", label: "Chest press" };
    const plan = uniformPlan(size, size, FLOOR_PLAN_LIMITS.maxFloors, labelled);
    const v2 = bytes(serializePlan(plan));
    const v1 = bytes(serializeV1(plan));

    console.warn(`${size}x${size}x6 labelled-machine: v1=${v1}B v2=${v2}B`);

    expect(FLOOR_PLAN_LIMITS.maxFloors).toBe(6);
    expect(v2).toBeLessThan(v1);
    // Still comfortably storable as a SQLite text value. At the 96x96 ceiling
    // the all-labelled text form is ~1.4 MB, so the bound scales with the
    // ceiling rather than pinning the old 40x40 number.
    expect(v2).toBeLessThan(2_000_000);
  });

  it("shrinks a realistic sparse plan, not only the synthetic extremes", () => {
    const { v1, v2, ratio } = measure(uniformPlan(12, 12, 1, MACHINE, { sparse: true }));
    console.warn(`12x12 sparse: v1=${v1}B v2=${v2}B ratio=${ratio.toFixed(1)}x`);

    expect(ratio).toBeGreaterThan(3);
  });
});
