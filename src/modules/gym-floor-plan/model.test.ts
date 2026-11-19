import { describe, expect, it } from "vitest";
import {
  FloorPlanError,
  addCategory,
  addFloor,
  countCategoryUsage,
  countCellsOutsideBounds,
  createCategory,
  createEmptyCells,
  createEmptyPlan,
  createFloor,
  deriveShortLabel,
  deserializePlan,
  findFloor,
  getCell,
  nextId,
  paintCells,
  parsePlanValue,
  removeCategory,
  removeFloor,
  renameFloor,
  resizeFloor,
  serializePlan,
  setCell,
  updateCategory,
  validatePlan,
} from "./model";
import {
  FLOOR_PLAN_LIMITS,
  FLOOR_PLAN_SCHEMA_VERSION,
  type FloorCell,
  type GymFloorPlan,
} from "./types";
import { migrateV1PlanRecord } from "./wire";
import { migrateV2PlanRecord } from "./wireBinary";

/** Asserts a model operation throws a FloorPlanError with a specific code. */
function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(FloorPlanError);
    expect((error as FloorPlanError).code).toBe(code);
    return;
  }
  throw new Error(`Expected FloorPlanError with code "${code}", but nothing was thrown.`);
}

function samplePlan(): GymFloorPlan {
  let plan = createEmptyPlan({ rows: 3, cols: 3, title: "Sample plan" });
  plan = addCategory(plan, { id: "cat-1", name: "Impulse machines", color: "#2563eb" });
  plan = addCategory(plan, { id: "cat-2", name: "Free weights", color: "#16a34a" });
  plan = setCell(plan, "floor-1", 0, 0, {
    kind: "machine",
    categoryId: "cat-1",
    label: "Chest press",
  });
  plan = setCell(plan, "floor-1", 2, 2, { kind: "void" });
  return plan;
}

describe("createEmptyPlan", () => {
  it("creates a versioned 12 × 12 plan with one empty floor", () => {
    const plan = createEmptyPlan();

    expect(plan.schemaVersion).toBe(FLOOR_PLAN_SCHEMA_VERSION);
    expect(plan.title).toBe("Gym floor plan");
    expect(plan.categories).toEqual([]);
    expect(plan.floors).toHaveLength(1);
    expect(plan.floors[0]).toMatchObject({
      id: "floor-1",
      name: "Ground floor",
      rows: 12,
      cols: 12,
    });
    expect(plan.floors[0].cells).toHaveLength(12);
    expect(plan.floors[0].cells.every((row) => row.length === 12)).toBe(true);
    expect(plan.floors[0].cells.flat().every((cell) => cell.kind === "empty")).toBe(true);
  });

  it("accepts custom dimensions, title and floor name", () => {
    const plan = createEmptyPlan({
      rows: 2,
      cols: 3,
      title: "  First floor  ",
      floorName: "  Mezzanine ",
    });

    expect(plan.title).toBe("First floor");
    expect(plan.floors[0].name).toBe("Mezzanine");
    expect(plan.floors[0].rows).toBe(2);
    expect(plan.floors[0].cols).toBe(3);
  });

  it("rejects out-of-range dimensions", () => {
    expectCode(() => createEmptyPlan({ rows: 0 }), "invalid-dimensions");
    expectCode(
      () => createEmptyPlan({ cols: FLOOR_PLAN_LIMITS.maxCols + 1 }),
      "invalid-dimensions"
    );
    expectCode(() => createEmptyPlan({ rows: 1.5 }), "invalid-dimensions");
  });

  it("rejects an empty or over-long title", () => {
    expectCode(() => createEmptyPlan({ title: "   " }), "invalid-title");
    expectCode(
      () => createEmptyPlan({ title: "x".repeat(FLOOR_PLAN_LIMITS.maxPlanTitleLength + 1) }),
      "invalid-title"
    );
  });
});

describe("createEmptyCells", () => {
  it("builds a rectangular grid of empty cells", () => {
    const cells = createEmptyCells(2, 3);

    expect(cells).toHaveLength(2);
    expect(cells.every((row) => row.length === 3)).toBe(true);
    expect(cells.flat().every((cell) => cell.kind === "empty")).toBe(true);
  });

  it("rejects dimensions outside the limits", () => {
    expectCode(() => createEmptyCells(0, 1), "invalid-dimensions");
    // One past the ceiling, whatever the ceiling is: the constant is the
    // single source of truth, so this test cannot drift from it.
    expectCode(() => createEmptyCells(1, FLOOR_PLAN_LIMITS.maxCols + 1), "invalid-dimensions");
  });
});

describe("createFloor / addFloor / removeFloor / renameFloor", () => {
  it("creates a floor with the requested shape", () => {
    const floor = createFloor({ id: "floor-a", name: "Basement", rows: 2, cols: 4 });

    expect(floor.id).toBe("floor-a");
    expect(floor.name).toBe("Basement");
    expect(floor.rows).toBe(2);
    expect(floor.cols).toBe(4);
    expect(floor.cells).toHaveLength(2);
    expect(floor.cells[0]).toHaveLength(4);
  });

  it("appends a floor with a generated id", () => {
    const plan = addFloor(createEmptyPlan({ rows: 2, cols: 2 }), {
      name: "First floor",
      rows: 3,
      cols: 3,
    });

    expect(plan.floors.map((floor) => floor.id)).toEqual(["floor-1", "floor-2"]);
    expect(plan.floors[1].name).toBe("First floor");
  });

  it("accepts an explicit floor id and rejects duplicates", () => {
    const plan = addFloor(createEmptyPlan({ rows: 2, cols: 2 }), {
      id: "floor-annex",
      name: "Annex",
      rows: 2,
      cols: 2,
    });
    expect(plan.floors[1].id).toBe("floor-annex");

    expectCode(
      () => addFloor(plan, { id: "floor-annex", name: "Other", rows: 2, cols: 2 }),
      "duplicate-id"
    );
  });

  it("enforces the floor limit", () => {
    let plan = createEmptyPlan({ rows: 2, cols: 2 });
    for (let index = 1; index < FLOOR_PLAN_LIMITS.maxFloors; index += 1) {
      plan = addFloor(plan, { name: `Floor ${index + 1}`, rows: 2, cols: 2 });
    }
    expect(plan.floors).toHaveLength(FLOOR_PLAN_LIMITS.maxFloors);
    expectCode(() => addFloor(plan, { name: "Too many", rows: 2, cols: 2 }), "too-many-floors");
  });

  it("removes a floor but never the last one", () => {
    const plan = addFloor(createEmptyPlan({ rows: 2, cols: 2 }), {
      name: "First floor",
      rows: 2,
      cols: 2,
    });
    const removed = removeFloor(plan, "floor-2");
    expect(removed.floors.map((floor) => floor.id)).toEqual(["floor-1"]);

    expectCode(() => removeFloor(removed, "floor-1"), "last-floor");
    expectCode(() => removeFloor(plan, "missing"), "unknown-floor");
  });

  it("renames a floor and returns the same reference for a no-op", () => {
    const plan = createEmptyPlan({ rows: 2, cols: 2 });
    const renamed = renameFloor(plan, "floor-1", "  Ground level  ");
    expect(renamed.floors[0].name).toBe("Ground level");
    expect(renameFloor(renamed, "floor-1", "Ground level")).toBe(renamed);
    expectCode(() => renameFloor(plan, "floor-1", "   "), "invalid-name");
  });
});

describe("nextId", () => {
  it("returns the smallest unused suffix", () => {
    expect(nextId("cat", [])).toBe("cat-1");
    expect(nextId("cat", ["cat-1", "cat-3"])).toBe("cat-2");
    expect(nextId("floor", ["floor-1", "floor-2"])).toBe("floor-3");
  });

  it("rejects an invalid prefix", () => {
    expectCode(() => nextId("1cat", []), "invalid-id");
  });
});

describe("resizeFloor", () => {
  it("grows from the top-left and pads new squares with empty cells", () => {
    const plan = samplePlan();
    const resized = resizeFloor(plan, "floor-1", 5, 5);
    const floor = resized.floors[0];

    expect(floor.rows).toBe(5);
    expect(floor.cols).toBe(5);
    expect(floor.cells).toHaveLength(5);
    expect(floor.cells.every((row) => row.length === 5)).toBe(true);
    expect(floor.cells[0][0]).toEqual({
      kind: "machine",
      categoryId: "cat-1",
      label: "Chest press",
    });
    expect(floor.cells[2][2]).toEqual({ kind: "void" });
    expect(floor.cells[4][4]).toEqual({ kind: "empty" });
  });

  it("shrinks by discarding every cell outside the new bounds", () => {
    const plan = samplePlan();
    const resized = resizeFloor(plan, "floor-1", 2, 2);
    const floor = resized.floors[0];

    expect(floor.rows).toBe(2);
    expect(floor.cols).toBe(2);
    expect(floor.cells[0][0].kind).toBe("machine");
    // (2,2) void and the machine at (0,0) is inside; the void is outside.
    expect(floor.cells.flat().some((cell) => cell.kind === "void")).toBe(false);
  });

  it("returns the same plan reference when dimensions do not change", () => {
    const plan = samplePlan();
    expect(resizeFloor(plan, "floor-1", 3, 3)).toBe(plan);
  });

  it("leaves other floors untouched", () => {
    let plan = samplePlan();
    plan = addFloor(plan, { name: "First floor", rows: 2, cols: 2 });
    const resized = resizeFloor(plan, "floor-1", 4, 4);

    expect(resized.floors[1]).toBe(plan.floors[1]);
  });

  it("rejects invalid dimensions and unknown floors", () => {
    const plan = samplePlan();
    expectCode(() => resizeFloor(plan, "floor-1", 0, 3), "invalid-dimensions");
    expectCode(() => resizeFloor(plan, "missing", 2, 2), "unknown-floor");
  });

  it("counts only non-empty cells that a resize would discard", () => {
    const plan = samplePlan();
    const floor = plan.floors[0];

    expect(countCellsOutsideBounds(floor, 2, 2)).toBe(1);
    expect(countCellsOutsideBounds(floor, 3, 3)).toBe(0);
    expect(countCellsOutsideBounds(floor, 5, 5)).toBe(0);
  });
});

describe("setCell / getCell / paintCells", () => {
  it("sets a machine, a void square and erases back to empty", () => {
    let plan = samplePlan();

    expect(getCell(plan, "floor-1", 0, 0)).toEqual({
      kind: "machine",
      categoryId: "cat-1",
      label: "Chest press",
    });
    expect(getCell(plan, "floor-1", 2, 2)).toEqual({ kind: "void" });

    plan = setCell(plan, "floor-1", 0, 0, { kind: "empty" });
    expect(getCell(plan, "floor-1", 0, 0)).toEqual({ kind: "empty" });
  });

  it("rejects unknown categories, out-of-bounds coordinates and bad cells", () => {
    const plan = samplePlan();

    expectCode(
      () => setCell(plan, "floor-1", 0, 1, { kind: "machine", categoryId: "missing" }),
      "unknown-category"
    );
    expectCode(
      () => setCell(plan, "floor-1", 9, 0, { kind: "machine", categoryId: "cat-1" }),
      "out-of-bounds"
    );
    expectCode(() => setCell(plan, "missing", 0, 0, { kind: "void" }), "unknown-floor");
    expectCode(
      () =>
        setCell(plan, "floor-1", 0, 1, {
          kind: "machine",
          categoryId: "cat-1",
          label: "x".repeat(FLOOR_PLAN_LIMITS.maxCellLabelLength + 1),
        }),
      "invalid-label"
    );
  });

  it("returns the same plan reference for a no-op", () => {
    const plan = samplePlan();
    expect(
      setCell(plan, "floor-1", 0, 0, { kind: "machine", categoryId: "cat-1", label: "Chest press" })
    ).toBe(plan);
    expect(setCell(plan, "floor-1", 1, 1, { kind: "empty" })).toBe(plan);
  });

  it("never mutates the input plan", () => {
    const plan = samplePlan();
    const before = JSON.stringify(plan);
    const next = setCell(plan, "floor-1", 1, 1, { kind: "void" });

    expect(next).not.toBe(plan);
    expect(JSON.stringify(plan)).toBe(before);
    expect(getCell(next, "floor-1", 1, 1)).toEqual({ kind: "void" });
  });

  it("paints a batch of cells, deduplicating and ignoring out-of-bounds points", () => {
    const plan = samplePlan();
    const painted = paintCells(
      plan,
      "floor-1",
      [
        { row: 1, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
        { row: -1, col: 0 },
        { row: 0, col: 99 },
      ],
      { kind: "machine", categoryId: "cat-2" }
    );

    expect(getCell(painted, "floor-1", 1, 1)).toEqual({
      kind: "machine",
      categoryId: "cat-2",
    });
    expect(getCell(painted, "floor-1", 1, 2).kind).toBe("machine");
    expect(getCell(painted, "floor-1", 0, 0).kind).toBe("machine");
  });

  it("returns the same plan for an empty stroke and validates the brush", () => {
    const plan = samplePlan();
    expect(paintCells(plan, "floor-1", [], { kind: "void" })).toBe(plan);
    expectCode(
      () =>
        paintCells(plan, "floor-1", [{ row: 0, col: 1 }], { kind: "machine", categoryId: "nope" }),
      "unknown-category"
    );
  });
});

describe("categories", () => {
  it("normalises colour and derives a short label from multiple words", () => {
    const category = createCategory({
      id: "cat-1",
      name: "Impulse machines",
      color: "#2563eb",
    });

    expect(category.color).toBe("#2563EB");
    expect(category.shortLabel).toBe("IM");
    expect(category.pattern).toBe("solid");
  });

  it("derives two letters for a single word and supports Greek names", () => {
    expect(deriveShortLabel("Toilets")).toBe("TO");
    expect(deriveShortLabel("Ελεύθερα Βάρη")).toBe("ΕΒ");
    expect(deriveShortLabel("A")).toBe("A");
  });

  it("keeps an explicit short label, trimmed and upper-cased", () => {
    const category = createCategory({
      id: "cat-1",
      name: "Free weights",
      color: "#16a34a",
      shortLabel: " fw ",
      pattern: "dots",
    });

    expect(category.shortLabel).toBe("FW");
    expect(category.pattern).toBe("dots");
  });

  it("rejects invalid colours, patterns and short labels", () => {
    expectCode(() => createCategory({ id: "cat-1", name: "Bad", color: "red" }), "invalid-color");
    expectCode(
      () => createCategory({ id: "cat-1", name: "Bad", color: "#12345" }),
      "invalid-color"
    );
    expectCode(
      () => createCategory({ id: "cat-1", name: "Bad", color: "#123456", shortLabel: "ABCD" }),
      "invalid-short-label"
    );
    expectCode(
      () => createCategory({ id: "cat-1", name: "Bad", color: "#123456", shortLabel: "A B" }),
      "invalid-short-label"
    );
    expectCode(
      () =>
        createCategory({
          id: "cat-1",
          name: "Bad",
          color: "#123456",
          pattern: "stripes" as never,
        }),
      "invalid-pattern"
    );
  });

  it("adds categories with generated ids", () => {
    let plan = addCategory(createEmptyPlan({ rows: 2, cols: 2 }), {
      name: "Impulse machines",
      color: "#2563eb",
    });
    plan = addCategory(plan, { name: "Arsenal machines", color: "#dc2626" });

    expect(plan.categories.map((category) => category.id)).toEqual(["cat-1", "cat-2"]);
    expect(plan.categories.map((category) => category.shortLabel)).toEqual(["IM", "AM"]);
  });

  it("rejects duplicate ids and enforces the category limit", () => {
    let plan = createEmptyPlan({ rows: 2, cols: 2 });
    for (let index = 0; index < FLOOR_PLAN_LIMITS.maxCategories; index += 1) {
      plan = addCategory(plan, {
        id: `cat-${index + 1}`,
        name: `Category ${index + 1}`,
        color: `#${(index + 1).toString(16).padStart(6, "0")}`,
      });
    }
    expect(plan.categories).toHaveLength(FLOOR_PLAN_LIMITS.maxCategories);
    expectCode(
      () => addCategory(plan, { name: "One too many", color: "#ffffff" }),
      "too-many-categories"
    );

    const oneCategory = addCategory(createEmptyPlan({ rows: 2, cols: 2 }), {
      id: "cat-1",
      name: "First",
      color: "#111111",
    });
    expectCode(
      () => addCategory(oneCategory, { id: "cat-1", name: "Duplicate", color: "#222222" }),
      "duplicate-id"
    );
  });

  it("updates a category without touching cells", () => {
    const plan = samplePlan();
    const updated = updateCategory(plan, "cat-1", {
      name: "Impulse",
      color: "#1d4ed8",
      shortLabel: "IP",
    });

    expect(updated.categories[0]).toMatchObject({
      id: "cat-1",
      name: "Impulse",
      color: "#1D4ED8",
      shortLabel: "IP",
    });
    expect(updated.floors[0].cells[0][0]).toEqual({
      kind: "machine",
      categoryId: "cat-1",
      label: "Chest press",
    });
  });

  it("returns the same plan for a no-op update and rejects bad input", () => {
    const plan = samplePlan();
    expect(updateCategory(plan, "cat-1", { name: "Impulse machines" })).toBe(plan);
    expectCode(() => updateCategory(plan, "missing", { name: "x" }), "unknown-category");
    expectCode(() => updateCategory(plan, "cat-1", { color: "blue" }), "invalid-color");
  });
});

describe("removeCategory", () => {
  it("clears machine cells when reassigned to null, leaving void squares alone", () => {
    const plan = samplePlan();
    const removed = removeCategory(plan, "cat-1", null);

    expect(removed.categories.map((category) => category.id)).toEqual(["cat-2"]);
    expect(getCell(removed, "floor-1", 0, 0)).toEqual({ kind: "empty" });
    expect(getCell(removed, "floor-1", 2, 2)).toEqual({ kind: "void" });
  });

  it("moves machine cells to another category, preserving the machine label", () => {
    const plan = samplePlan();
    const removed = removeCategory(plan, "cat-1", "cat-2");

    expect(getCell(removed, "floor-1", 0, 0)).toEqual({
      kind: "machine",
      categoryId: "cat-2",
      label: "Chest press",
    });
    expect(removed.categories.map((category) => category.id)).toEqual(["cat-2"]);
  });

  it("rejects unknown categories, self-reassignment and unknown targets", () => {
    const plan = samplePlan();
    expectCode(() => removeCategory(plan, "missing", null), "unknown-category");
    expectCode(() => removeCategory(plan, "cat-1", "cat-1"), "invalid-reassignment");
    expectCode(() => removeCategory(plan, "cat-1", "missing"), "unknown-category");
  });

  it("counts usage across all floors and per floor", () => {
    let plan = samplePlan();
    plan = addFloor(plan, { name: "First floor", rows: 2, cols: 2 });
    plan = setCell(plan, "floor-2", 0, 0, { kind: "machine", categoryId: "cat-1" });

    expect(countCategoryUsage(plan, "cat-1")).toBe(2);
    expect(countCategoryUsage(plan, "cat-1", "floor-1")).toBe(1);
    expect(countCategoryUsage(plan, "cat-1", "floor-2")).toBe(1);
    expect(countCategoryUsage(plan, "cat-2")).toBe(0);
    expectCode(() => countCategoryUsage(plan, "missing"), "unknown-category");
  });
});

describe("validatePlan", () => {
  it("accepts a valid plan", () => {
    const result = validatePlan(samplePlan());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects values that are not objects", () => {
    for (const value of [null, undefined, "plan", 42, []]) {
      const result = validatePlan(value);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("not-an-object");
    }
  });

  it("rejects a missing or unsupported schema version", () => {
    const plan = JSON.parse(serializePlan(samplePlan())) as Record<string, unknown>;

    expect(validatePlan({ ...plan, schemaVersion: undefined }).errors[0].code).toBe(
      "invalid-schema-version"
    );
    expect(
      validatePlan({ ...plan, schemaVersion: FLOOR_PLAN_SCHEMA_VERSION + 1 }).errors[0].code
    ).toBe("unsupported-schema-version");
  });

  it("rejects unknown category references", () => {
    const raw = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Bad",
      categories: [],
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          rows: 1,
          cols: 1,
          cells: [[{ kind: "machine", categoryId: "ghost" }]],
        },
      ],
    };

    const result = validatePlan(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.code === "unknown-category")).toBe(true);
  });

  it("rejects ragged grids and dimension mismatches", () => {
    const raw = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Bad",
      categories: [],
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          rows: 2,
          cols: 2,
          cells: [[{ kind: "empty" }]],
        },
      ],
    };

    const result = validatePlan(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.filter((issue) => issue.code === "invalid-cells")).toHaveLength(2);
  });

  it("rejects duplicate floor and category ids", () => {
    const raw = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Bad",
      categories: [
        { id: "cat-1", name: "A", color: "#111111", shortLabel: "A", pattern: "solid" },
        { id: "cat-1", name: "B", color: "#222222", shortLabel: "B", pattern: "solid" },
      ],
      floors: [
        { id: "floor-1", name: "Ground", rows: 1, cols: 1, cells: [[{ kind: "empty" }]] },
        { id: "floor-1", name: "First", rows: 1, cols: 1, cells: [[{ kind: "empty" }]] },
      ],
    };

    const result = validatePlan(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.filter((issue) => issue.code === "duplicate-id")).toHaveLength(2);
  });

  it("rejects invalid colours, patterns, short labels and cell kinds", () => {
    const raw = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Bad",
      categories: [
        { id: "cat-1", name: "A", color: "blue", shortLabel: "A", pattern: "stripes" },
        { id: "cat-2", name: "B", color: "#123456", shortLabel: "A B", pattern: "solid" },
      ],
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          rows: 1,
          cols: 2,
          cells: [
            [{ kind: "desk" }, { kind: "machine", categoryId: "cat-1", label: "x".repeat(41) }],
          ],
        },
      ],
    };

    const codes = validatePlan(raw).errors.map((issue) => issue.code);
    expect(codes).toContain("invalid-color");
    expect(codes).toContain("invalid-pattern");
    expect(codes).toContain("invalid-short-label");
    expect(codes).toContain("invalid-cell");
  });

  it("warns about duplicate colours and short labels without invalidating", () => {
    const raw = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Plan",
      categories: [
        { id: "cat-1", name: "A", color: "#2563eb", shortLabel: "A", pattern: "solid" },
        { id: "cat-2", name: "B", color: "#2563EB", shortLabel: "A", pattern: "solid" },
      ],
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          rows: 1,
          cols: 2,
          cells: [
            [
              { kind: "machine", categoryId: "cat-1" },
              { kind: "machine", categoryId: "cat-2" },
            ],
          ],
        },
      ],
    };

    const result = validatePlan(raw);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["category-color-duplicate", "category-short-label-duplicate"])
    );
  });

  it("warns about unused categories, empty floors and duplicate floor names", () => {
    const raw = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Plan",
      categories: [
        { id: "cat-1", name: "Unused", color: "#2563eb", shortLabel: "U", pattern: "solid" },
      ],
      floors: [
        { id: "floor-1", name: "Ground", rows: 1, cols: 1, cells: [[{ kind: "empty" }]] },
        { id: "floor-2", name: " ground ", rows: 1, cols: 1, cells: [[{ kind: "empty" }]] },
      ],
    };

    const codes = validatePlan(raw).warnings.map((issue) => issue.code);
    expect(codes).toContain("category-unused");
    expect(codes).toContain("floor-empty");
    expect(codes).toContain("floor-name-duplicate");
  });

  it("rejects out-of-range dimensions and an empty floor list", () => {
    const base = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Plan",
      categories: [],
    };

    expect(
      validatePlan({
        ...base,
        floors: [
          { id: "floor-1", name: "G", rows: 0, cols: FLOOR_PLAN_LIMITS.maxCols + 1, cells: [] },
        ],
      }).errors.map((issue) => issue.code)
    ).toEqual(expect.arrayContaining(["invalid-dimensions"]));

    expect(validatePlan({ ...base, floors: [] }).errors.map((issue) => issue.code)).toContain(
      "no-floors"
    );
  });
});

describe("serialization", () => {
  it("round-trips a plan and includes the schema version", () => {
    const plan = samplePlan();
    const serialized = serializePlan(plan);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;

    expect(parsed.schemaVersion).toBe(FLOOR_PLAN_SCHEMA_VERSION);

    const result = deserializePlan(serialized);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toEqual(plan);
  });

  it("serializes only known fields in a canonical order", () => {
    const plan = samplePlan();
    const withExtras = {
      ...plan,
      extra: "ignored",
      categories: plan.categories.map((category) => ({ ...category, extra: true })),
      floors: plan.floors.map((floor) => ({ ...floor, extra: true })),
    } as unknown as GymFloorPlan;

    const parsed = JSON.parse(serializePlan(withExtras)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["schemaVersion", "title", "categories", "floors"]);
    expect(parsed).not.toHaveProperty("extra");
    expect((parsed.categories as Array<Record<string, unknown>>)[0]).not.toHaveProperty("extra");
    expect((parsed.floors as Array<Record<string, unknown>>)[0]).not.toHaveProperty("extra");
  });

  it("refuses to serialize an invalid plan", () => {
    const plan = samplePlan();
    const invalid = {
      ...plan,
      categories: [{ ...plan.categories[0], color: "not-a-colour" }],
    } as unknown as GymFloorPlan;

    expectCode(() => serializePlan(invalid), "invalid-plan");
  });

  it("rejects malformed JSON", () => {
    const result = deserializePlan("{not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe("invalid-json");
  });

  it("rejects newer schema versions with an actionable message", () => {
    const parsed = JSON.parse(serializePlan(samplePlan())) as Record<string, unknown>;
    const result = parsePlanValue({ ...parsed, schemaVersion: FLOOR_PLAN_SCHEMA_VERSION + 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe("unsupported-schema-version");
    expect(result.issues[0].message).toContain("newer");
  });

  it("rejects a missing schema version and an unmigratable older one", () => {
    const parsed = JSON.parse(serializePlan(samplePlan())) as Record<string, unknown>;

    const missing = parsePlanValue({ ...parsed, schemaVersion: undefined });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues[0].code).toBe("invalid-schema-version");

    const older = parsePlanValue({ ...parsed, schemaVersion: 0 });
    expect(older.ok).toBe(false);
    if (!older.ok) expect(older.issues[0].code).toBe("missing-migration");
  });

  it("runs a registered migration before validation", () => {
    const legacy = {
      schemaVersion: 0,
      title: "Legacy plan",
      categories: [],
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          rows: 1,
          cols: 1,
          cells: [[{ kind: "empty" }]],
        },
      ],
    };
    // Version 0 is hypothetical, so the test supplies its own step; the real
    // 1 -> 2 and 2 -> 3 steps are chained in afterwards to prove the loop keeps
    // walking all the way to the current version.
    const migrations = {
      0: (raw: Record<string, unknown>) => ({ ...raw, schemaVersion: 1 }),
      1: migrateV1PlanRecord,
      2: migrateV2PlanRecord,
    };

    const result = parsePlanValue(legacy, migrations);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.schemaVersion).toBe(FLOOR_PLAN_SCHEMA_VERSION);
    expect(result.plan.title).toBe("Legacy plan");
    expect(result.plan.floors[0].cells).toEqual([[{ kind: "empty" }]]);
  });

  it("returns validation issues for a structurally invalid parsed value", () => {
    const result = parsePlanValue({
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "",
      categories: [],
      floors: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["invalid-title", "no-floors"])
    );
  });

  it("surfaces validation warnings on a successful parse", () => {
    const plan = addCategory(createEmptyPlan({ rows: 2, cols: 2 }), {
      name: "Unused",
      color: "#2563eb",
    });
    const result = parsePlanValue(JSON.parse(serializePlan(plan)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((issue) => issue.code)).toContain("category-unused");
  });
});

describe("findFloor / getCell helpers", () => {
  it("finds floors and rejects unknown ids when reading cells", () => {
    const plan = samplePlan();
    expect(findFloor(plan, "floor-1")?.name).toBe("Ground floor");
    expect(findFloor(plan, "missing")).toBeUndefined();
    expectCode(() => getCell(plan, "missing", 0, 0), "unknown-floor");
    expectCode(() => getCell(plan, "floor-1", 0, 3), "out-of-bounds");
  });

  it("treats a missing cell as empty", () => {
    const plan = samplePlan();
    const cell: FloorCell = getCell(plan, "floor-1", 1, 1);
    expect(cell).toEqual({ kind: "empty" });
  });
});
