import { describe, expect, it } from "vitest";
import { FloorPlanError } from "./model";
import {
  addCategory,
  addFloor,
  createEmptyPlan,
  decodePlanBytes,
  deserializePlan,
  encodePlanBytes,
  paintCells,
  serializePlan,
  setCell,
} from "./model";
import {
  DEFAULT_FLOOR_PLAN_LABELS,
  DEFAULT_FLOOR_PLAN_THEME,
  PRINT_FLOOR_PLAN_THEME,
  buildFloorRenderModel,
  buildLegend,
  checkRenderModel,
  describeFloor,
  getCellAppearance,
  getInkColor,
  patternToBackground,
} from "./render";
import {
  CELL_PATTERNS,
  FLOOR_PLAN_LIMITS,
  type CellPattern,
  type FloorCell,
  type FloorPlanLabels,
  type GymFloorPlan,
} from "./types";

function samplePlan(): GymFloorPlan {
  let plan = createEmptyPlan({ rows: 3, cols: 4 });
  plan = addCategory(plan, { id: "cat-1", name: "Impulse machines", color: "#2563eb" });
  plan = addCategory(plan, { id: "cat-2", name: "Toilets", color: "#ffffff" });
  plan = setCell(plan, "floor-1", 0, 0, {
    kind: "machine",
    categoryId: "cat-1",
    label: "Chest press",
  });
  plan = setCell(plan, "floor-1", 1, 1, { kind: "void" });
  return plan;
}

/** `n` categories named `Category 1..n`, one per palette entry, cycling. */
function planWithCategories(count: number, rows = 3, cols = 4): GymFloorPlan {
  const palette = ["#2563EB", "#DC2626", "#16A34A", "#F59E0B", "#7C3AED"];
  let plan = createEmptyPlan({ rows, cols });
  for (let index = 0; index < count; index += 1) {
    plan = addCategory(plan, {
      id: `cat-${index + 1}`,
      name: `Category ${index + 1}`,
      color: palette[index % palette.length],
      shortLabel: `C${index + 1}`,
      pattern: CELL_PATTERNS[index % CELL_PATTERNS.length],
    });
  }
  return plan;
}

/** A square floor with every square painted the same category. */
function uniformPlan(rows: number, cols: number, categoryId: string): GymFloorPlan {
  const plan = planWithCategories(1, rows, cols);
  const coords = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) coords.push({ row, col });
  }
  const painted = paintCells(plan, "floor-1", coords, {
    kind: "machine",
    categoryId,
  });
  // `paintCells` validates the category, so `categoryId` must be the real one.
  return categoryId === "cat-1" ? painted : plan;
}

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

describe("getInkColor", () => {
  it("picks black on light backgrounds and white on dark ones", () => {
    expect(getInkColor("#FFFFFF")).toBe("#000000");
    expect(getInkColor("#F59E0B")).toBe("#000000");
    expect(getInkColor("#000000")).toBe("#ffffff");
    expect(getInkColor("#2563EB")).toBe("#ffffff");
  });

  it("falls back to black for values it cannot parse", () => {
    expect(getInkColor("rgb(var(--accent))")).toBe("#000000");
    expect(getInkColor("")).toBe("#000000");
  });
});

describe("patternToBackground", () => {
  it("returns no image for solid and a visible pattern for the rest", () => {
    const patterns: CellPattern[] = ["solid", "diagonal", "dots", "grid", "cross"];
    const images = new Set<string>();

    for (const pattern of patterns) {
      const background = patternToBackground(pattern, "#FFFFFF");
      if (pattern === "solid") {
        expect(background.backgroundImage).toBe("none");
      } else {
        expect(background.backgroundImage.length).toBeGreaterThan(0);
        images.add(background.backgroundImage);
      }
    }

    // Every non-solid pattern is visually distinct.
    expect(images.size).toBe(4);
  });

  it("gives dots a background size so the pattern tiles", () => {
    expect(patternToBackground("dots", "#000000").backgroundSize).toBe("6px 6px");
    expect(patternToBackground("cross", "#000000").backgroundSize).toBe("8px 8px");
    expect(patternToBackground("diagonal", "#000000").backgroundSize).toBeUndefined();
  });
});

describe("buildLegend", () => {
  it("lists every category in plan order plus the fixed void entry", () => {
    const legend = buildLegend(samplePlan(), "floor-1");

    expect(legend.map((entry) => entry.id)).toEqual(["cat-1", "cat-2", "__void__"]);
    expect(legend[0]).toMatchObject({
      kind: "category",
      name: "Impulse machines",
      color: "#2563EB",
      shortLabel: "IM",
      pattern: "solid",
      count: 1,
    });
    expect(legend[1]).toMatchObject({ name: "Toilets", count: 0 });
    expect(legend[2]).toMatchObject({
      kind: "void",
      name: DEFAULT_FLOOR_PLAN_LABELS.unavailable,
      color: DEFAULT_FLOOR_PLAN_THEME.voidColor,
      shortLabel: "×",
      pattern: "diagonal",
      count: 1,
    });
  });

  it("uses the injected theme and labels", () => {
    const greek: FloorPlanLabels = {
      ...DEFAULT_FLOOR_PLAN_LABELS,
      unavailable: "μη διαθέσιμο",
    };
    const legend = buildLegend(samplePlan(), "floor-1", PRINT_FLOOR_PLAN_THEME, greek);

    expect(legend[2].name).toBe("μη διαθέσιμο");
    expect(legend[2].color).toBe(PRINT_FLOOR_PLAN_THEME.voidColor);
  });
});

describe("describeFloor", () => {
  it("summarises equipment, void and open squares", () => {
    const summary = describeFloor(samplePlan(), "floor-1");

    expect(summary).toContain("Ground floor");
    expect(summary).toContain("3 × 4");
    expect(summary).toContain("1 Impulse machines");
    expect(summary).toContain("1 unavailable");
    expect(summary).toContain("10 open floor");
  });

  it("says so when a floor has no equipment", () => {
    const summary = describeFloor(createEmptyPlan({ rows: 2, cols: 2 }), "floor-1");
    expect(summary).toContain("no equipment");
    expect(summary).toContain("4 open floor");
  });
});

describe("buildFloorRenderModel — packed appearance model", () => {
  it("returns a rows*cols index into a small shared appearance table", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");

    expect(model.floorId).toBe("floor-1");
    expect(model.floorName).toBe("Ground floor");
    expect(model.rows).toBe(3);
    expect(model.cols).toBe(4);
    expect(model.cellAppearanceIndex).toBeInstanceOf(Uint16Array);
    expect(model.cellAppearanceIndex).toHaveLength(12);
    expect(checkRenderModel(model)).toEqual([]);

    // Three distinct appearances for twelve squares: empty, void, cat-1. The
    // unused category and the throwaway `cell.label` must NOT add entries.
    expect(model.appearances).toHaveLength(3);
    expect(new Set(model.cellAppearanceIndex).size).toBe(3);
  });

  it("addresses corners and the middle through appearanceAt", () => {
    const plan = samplePlan();
    const model = buildFloorRenderModel(plan, "floor-1");

    // Top-left is the labelled machine; bottom-right and the other two corners
    // are empty floor; (1, 1) is the void square.
    expect(model.appearanceAt(0, 0)).toMatchObject({
      kind: "machine",
      categoryId: "cat-1",
      color: "#2563EB",
      shortLabel: "IM",
      pattern: "solid",
    });
    expect(model.appearanceAt(0, 3)).toMatchObject({
      kind: "empty",
      color: DEFAULT_FLOOR_PLAN_THEME.emptyColor,
      shortLabel: "",
    });
    expect(model.appearanceAt(2, 0)).toEqual(model.appearanceAt(0, 3));
    expect(model.appearanceAt(2, 3)).toEqual(model.appearanceAt(0, 3));
    expect(model.appearanceAt(1, 1)).toMatchObject({
      kind: "void",
      color: DEFAULT_FLOOR_PLAN_THEME.voidColor,
      shortLabel: "×",
      pattern: "diagonal",
    });

    // The index really is row-major: entry `row * cols + col`.
    expect(model.cellAppearanceIndex[1 * 4 + 1]).toBe(
      model.appearances.indexOf(model.appearanceAt(1, 1) as never)
    );
    expect(model.cellAppearanceIndex[0]).toBe(
      model.appearances.indexOf(model.appearanceAt(0, 0) as never)
    );
  });

  it("returns null from appearanceAt and describeCell outside the grid", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");

    for (const [row, col] of [
      [-1, 0],
      [0, -1],
      [3, 0],
      [0, 4],
      [3, 4],
      [-1, -1],
      [1.5, 0],
      [0, Number.NaN],
    ] as const) {
      expect(model.appearanceAt(row, col)).toBeNull();
      expect(model.describeCell(row, col)).toBeNull();
    }
  });

  it("derives the accessible strings for ONE square on demand", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");

    expect(model.describeCell(0, 0)).toEqual({
      ariaLabel: "Row 1, column 1: Impulse machines — Chest press",
      tooltip: "Impulse machines — Chest press",
    });
    expect(model.describeCell(0, 1)).toEqual({
      ariaLabel: "Row 1, column 2: open floor",
      tooltip: "open floor",
    });
    expect(model.describeCell(1, 1)).toEqual({
      ariaLabel: "Row 2, column 2: unavailable",
      tooltip: "unavailable",
    });

    // The per-square strings are NOT stored on the shared appearance: that is
    // the whole reason the model is small.
    for (const appearance of model.appearances) {
      expect(Object.keys(appearance).sort()).toEqual([
        "categoryId",
        "color",
        "inkColor",
        "kind",
        "pattern",
        "shortLabel",
      ]);
    }
  });

  it("shares one appearance when every square is the same category", () => {
    const plan = uniformPlan(6, 5, "cat-1");
    const model = buildFloorRenderModel(plan, "floor-1");

    expect(model.cellAppearanceIndex).toHaveLength(30);
    expect(model.appearances).toHaveLength(1);
    expect(model.appearances[0]).toMatchObject({ kind: "machine", categoryId: "cat-1" });
    // Every one of the 30 squares addresses the same entry: maximal sharing.
    expect(model.cellAppearanceIndex.every((index) => index === 0)).toBe(true);
    expect(model.describeCell(5, 4)?.tooltip).toBe("Category 1");
  });

  it("keeps the table at maxCategories + 3 for a plan using every slot", () => {
    // 20 categories (the limit) + void + empty = 22 appearances. The 23rd slot
    // the module allows for is the unknown-category fallback, which a valid
    // plan never produces.
    const plan = planWithCategories(FLOOR_PLAN_LIMITS.maxCategories, 5, 5);
    const coords: Array<{ row: number; col: number }> = [];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) coords.push({ row, col });
    }
    // One machine square per category, in order, plus one void.
    let next = plan;
    for (let index = 0; index < FLOOR_PLAN_LIMITS.maxCategories; index += 1) {
      next = setCell(next, "floor-1", Math.floor(index / 5), index % 5, {
        kind: "machine",
        categoryId: `cat-${index + 1}`,
      });
    }
    next = setCell(next, "floor-1", 4, 4, { kind: "void" });
    const model = buildFloorRenderModel(next, "floor-1");

    expect(model.appearances).toHaveLength(FLOOR_PLAN_LIMITS.maxCategories + 2);
    expect(model.appearances.length).toBeLessThanOrEqual(FLOOR_PLAN_LIMITS.maxCategories + 3);
    expect(checkRenderModel(model)).toEqual([]);

    const kinds = new Set(model.appearances.map((appearance) => appearance.kind));
    expect(kinds).toEqual(new Set(["machine", "void", "empty"]));

    // Every category id appears exactly once in the table.
    const ids = model.appearances
      .map((appearance) => appearance.categoryId)
      .filter((id): id is string => id !== null);
    expect(new Set(ids).size).toBe(FLOOR_PLAN_LIMITS.maxCategories);
    expect(ids).toHaveLength(FLOOR_PLAN_LIMITS.maxCategories);
  });

  it("carries the legend and summary", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");

    expect(model.legend).toHaveLength(3);
    expect(model.legend).toEqual(buildLegend(samplePlan(), "floor-1"));
    expect(model.summary).toBe(describeFloor(samplePlan(), "floor-1"));
  });

  it("rejects an unknown floor", () => {
    expectCode(() => buildFloorRenderModel(samplePlan(), "missing"), "unknown-floor");
  });

  it("renders an unknown category reference without crashing", () => {
    const plan = samplePlan();
    const bad: GymFloorPlan = {
      ...plan,
      floors: plan.floors.map((floor) => ({
        ...floor,
        cells: floor.cells.map((row, rowIndex) =>
          row.map((cell, colIndex): FloorCell =>
            rowIndex === 0 && colIndex === 0 ? { kind: "machine", categoryId: "ghost" } : cell
          )
        ),
      })),
    };

    const model = buildFloorRenderModel(bad, "floor-1");
    const appearance = model.appearanceAt(0, 0);
    expect(appearance?.color).toBe("#DC2626");
    expect(appearance?.shortLabel).toBe("?");
    expect(appearance?.pattern).toBe("cross");
    expect(model.describeCell(0, 0)?.ariaLabel).toContain(
      DEFAULT_FLOOR_PLAN_LABELS.unknownCategory
    );
  });
});

describe("buildFloorRenderModel — 96 × 96 ceiling", () => {
  it("produces exactly rows*cols indices at the ceiling", () => {
    const plan = createEmptyPlan({ rows: 96, cols: 96 });
    const model = buildFloorRenderModel(plan, "floor-1");

    expect(model.rows).toBe(96);
    expect(model.cols).toBe(96);
    expect(model.cellAppearanceIndex).toHaveLength(96 * 96);
    expect(model.cellAppearanceIndex.length).toBe(9216);
    // An all-empty 96 × 96 floor is ONE appearance.
    expect(model.appearances).toHaveLength(1);
    expect(checkRenderModel(model)).toEqual([]);

    // All four corners plus the middle resolve, and out-of-bounds does not.
    for (const [row, col] of [
      [0, 0],
      [0, 95],
      [95, 0],
      [95, 95],
      [48, 48],
    ] as const) {
      expect(model.appearanceAt(row, col)).toMatchObject({ kind: "empty" });
    }
    for (const [row, col] of [
      [-1, 0],
      [0, -1],
      [96, 0],
      [0, 96],
      [96, 96],
    ] as const) {
      expect(model.appearanceAt(row, col)).toBeNull();
      expect(model.describeCell(row, col)).toBeNull();
    }

    expect(model.describeCell(95, 95)).toEqual({
      ariaLabel: "Row 96, column 96: open floor",
      tooltip: "open floor",
    });
  });
});

describe("REGRESSION: packed render model size", () => {
  /**
   * Adds up the retained size of a value without a heap profiler: a
   * `Uint16Array` costs 2 bytes per entry, a string 2 bytes per UTF-16 code
   * unit, and every object/array/function has a fixed overhead. This is a
   * lower bound on the real heap cost, which is what makes it a safe guard: it
   * can never make the packed model look bigger than it is, and it counts the
   * per-square objects of the old model as the objects they were.
   */
  interface Footprint {
    bytes: number;
    objects: number;
    arrays: number;
    typedArrays: number;
    stringChars: number;
  }

  const OVERHEAD = { object: 32, array: 48, function: 64, string: 16 } as const;

  function footprint(root: unknown): Footprint {
    const seenObjects = new Set<object>();
    const seenStrings = new Set<string>();
    const totals: Footprint = {
      bytes: 0,
      objects: 0,
      arrays: 0,
      typedArrays: 0,
      stringChars: 0,
    };
    const queue: unknown[] = [root];

    while (queue.length > 0) {
      const value = queue.pop();
      if (value === null || value === undefined) continue;
      const type = typeof value;
      if (type === "string") {
        const text = value as string;
        if (!seenStrings.has(text)) {
          seenStrings.add(text);
          totals.stringChars += text.length;
          totals.bytes += OVERHEAD.string + text.length * 2;
        }
        continue;
      }
      if (type === "function") {
        totals.bytes += OVERHEAD.function;
        continue;
      }
      if (type !== "object") continue;

      const object = value as object;
      if (seenObjects.has(object)) continue;
      seenObjects.add(object);

      if (ArrayBuffer.isView(object) && object instanceof Uint16Array) {
        totals.typedArrays += 1;
        totals.bytes += 96 + object.length * 2;
        continue;
      }
      if (Array.isArray(object)) {
        totals.arrays += 1;
        totals.bytes += OVERHEAD.array;
        for (const entry of object) queue.push(entry);
        continue;
      }
      totals.objects += 1;
      totals.bytes += OVERHEAD.object;
      for (const key of Object.keys(object)) {
        queue.push((object as Record<string, unknown>)[key]);
      }
    }
    return totals;
  }

  it("stays orders of magnitude under the per-cell model at 40 × 40", () => {
    const plan = createEmptyPlan({ rows: 40, cols: 40 });
    const model = buildFloorRenderModel(plan, "floor-1");
    const measured = footprint(model);

    // The old per-cell model was measured at ~300 KB of JSON and 1 603 heap
    // objects for these 1 600 squares (~192 B/cell).
    expect(measured.objects).toBeLessThanOrEqual(4);
    expect(measured.arrays).toBeLessThanOrEqual(2);
    expect(measured.typedArrays).toBe(1);
    // 1 600 * 2 bytes + the two accessor functions + the appearance table.
    expect(measured.bytes).toBeLessThan(6_000);
    expect(measured.objects + measured.arrays + measured.typedArrays).toBeLessThanOrEqual(8);
  });

  it("stays orders of magnitude under the per-cell model at 96 × 96", () => {
    const plan = createEmptyPlan({ rows: 96, cols: 96 });
    const model = buildFloorRenderModel(plan, "floor-1");
    const measured = footprint(model);

    // 9 216 squares: the index array alone is 18 432 bytes, versus ~1.7 MB of
    // JSON and 9 219 heap objects for the per-cell model.
    expect(measured.typedArrays).toBe(1);
    expect(model.cellAppearanceIndex.byteLength).toBe(96 * 96 * 2);
    expect(measured.bytes).toBeLessThan(32_000);
    expect(measured.objects).toBeLessThanOrEqual(4);
    expect(measured.objects + measured.arrays + measured.typedArrays).toBeLessThanOrEqual(8);
  });

  it("allocates the same handful of objects at both sizes", () => {
    // The point of the packed model: allocation count must not grow with the
    // grid. Compare 40 × 40 against 96 × 96 on the SAME plan shape.
    const small = footprint(
      buildFloorRenderModel(createEmptyPlan({ rows: 40, cols: 40 }), "floor-1")
    );
    const large = footprint(
      buildFloorRenderModel(createEmptyPlan({ rows: 96, cols: 96 }), "floor-1")
    );

    expect(large.objects).toBe(small.objects);
    expect(large.arrays).toBe(small.arrays);
    expect(large.typedArrays).toBe(small.typedArrays);
    // Only the 2-byte-per-square array grows, and linearly.
    const expectedGrowth = (96 * 96 - 40 * 40) * 2;
    expect(large.bytes - small.bytes).toBe(expectedGrowth);
  });
});

describe("96 × 96 round-trip through both wire forms", () => {
  /** Deterministic realistic plan: ~40% machines, ~8% void, 4 categories. */
  function realistic96(categories: number): GymFloorPlan {
    let plan = createEmptyPlan({ rows: 96, cols: 96 });
    for (let index = 0; index < categories; index += 1) {
      plan = addCategory(plan, {
        id: `cat-${index + 1}`,
        name: `Category ${index + 1}`,
        color: ["#2563EB", "#DC2626", "#16A34A", "#F59E0B"][index % 4],
        shortLabel: `C${index + 1}`,
        pattern: CELL_PATTERNS[index % CELL_PATTERNS.length],
      });
    }
    const machines: Array<{ row: number; col: number }> = [];
    const voids: Array<{ row: number; col: number }> = [];
    for (let row = 0; row < 96; row += 1) {
      for (let col = 0; col < 96; col += 1) {
        const noise = (row * 7919 + col * 104729) % 100;
        if (noise < 40) machines.push({ row, col });
        else if (noise < 48) voids.push({ row, col });
      }
    }
    const painted = paintCells(plan, "floor-1", machines, {
      kind: "machine",
      categoryId: "cat-1",
    });
    return paintCells(painted, "floor-1", voids, { kind: "void" });
  }

  it("validates at 96 × 96 without a dimension issue", () => {
    const plan = createEmptyPlan({ rows: 96, cols: 96 });
    expect(() => serializePlan(plan)).not.toThrow();
    expect(plan.floors[0].rows).toBe(FLOOR_PLAN_LIMITS.maxRows);
  });

  it("round-trips a 96 × 96 plan through the canonical text form", () => {
    const plan = realistic96(4);
    const result = deserializePlan(serializePlan(plan));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.floors[0].rows).toBe(96);
    expect(result.plan.floors[0].cols).toBe(96);
    expect(result.plan.floors[0].cells).toHaveLength(96);
    expect(result.plan.floors[0].cells[0]).toHaveLength(96);

    // Spot-check the corners and one interior square survive the RLE pass.
    expect(result.plan.floors[0].cells[0][0]).toEqual(plan.floors[0].cells[0][0]);
    expect(result.plan.floors[0].cells[95][95]).toEqual(plan.floors[0].cells[95][95]);
    expect(result.plan.floors[0].cells[48][48]).toEqual(plan.floors[0].cells[48][48]);
  });

  it("round-trips a 96 × 96 plan through the v3 binary codec", () => {
    const plan = realistic96(4);
    const payload = encodePlanBytes(plan);
    const result = decodePlanBytes(payload);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.floors[0].rows).toBe(96);
    expect(result.plan.floors[0].cols).toBe(96);
    expect(result.plan.floors[0].cells[0][0]).toEqual(plan.floors[0].cells[0][0]);
    expect(result.plan.floors[0].cells[95][95]).toEqual(plan.floors[0].cells[95][95]);
    expect(result.plan.floors[0].cells[48][48]).toEqual(plan.floors[0].cells[48][48]);

    // The real payload size at the ceiling. 96*96*2 bits of kind alone is
    // 2 304 bytes; an all-empty floor is therefore just over 2.3 KB, and a
    // realistic 40%-machine plan is under 4 KB for the whole floor.
    const emptyBytes = encodePlanBytes(createEmptyPlan({ rows: 96, cols: 96 })).byteLength;
    expect(emptyBytes).toBeGreaterThan(2_300);
    expect(emptyBytes).toBeLessThan(2_500);
    expect(payload.byteLength).toBeGreaterThan(emptyBytes);
    expect(payload.byteLength).toBeLessThan(6_000);
  });

  it("round-trips a fully painted 96 × 96 floor with labels", () => {
    // Worst case for the label side table: every square a labelled machine.
    const cells: FloorCell[][] = [];
    for (let row = 0; row < 96; row += 1) {
      const line: FloorCell[] = [];
      for (let col = 0; col < 96; col += 1) {
        line.push({ kind: "machine", categoryId: "cat-1", label: `M${row}-${col}` });
      }
      cells.push(line);
    }
    const plan: GymFloorPlan = {
      ...createEmptyPlan({ rows: 96, cols: 96 }),
      categories: [
        {
          id: "cat-1",
          name: "Machines",
          color: "#2563EB",
          shortLabel: "M",
          pattern: "solid",
        },
      ],
      floors: [{ id: "floor-1", name: "Ground floor", rows: 96, cols: 96, cells }],
    };

    const payload = encodePlanBytes(plan);
    const decoded = decodePlanBytes(payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.plan.floors[0].cells[95][95]).toEqual({
      kind: "machine",
      categoryId: "cat-1",
      label: "M95-95",
    });
    expect(decoded.plan.floors[0].cells[0][0]).toEqual({
      kind: "machine",
      categoryId: "cat-1",
      label: "M0-0",
    });
  });

  it("round-trips the largest label ordinal at the ceiling", () => {
    // Six 96 × 96 floors have 55 296 cells, so the label side table's widest
    // cell ordinal is 55 295 — 3 varint bytes, not the 2 that covered the old
    // 40 × 40 × 6 ceiling (9 600 cells). Label ONLY the last cell so the
    // biggest possible ordinal is exercised.
    let plan = createEmptyPlan({ rows: 96, cols: 96 });
    plan = addCategory(plan, { id: "cat-1", name: "Machines", color: "#2563EB" });
    for (let index = 1; index < FLOOR_PLAN_LIMITS.maxFloors; index += 1) {
      plan = addFloor(plan, { name: `Floor ${index + 1}`, rows: 96, cols: 96 });
    }
    const labelled: GymFloorPlan = {
      ...plan,
      floors: plan.floors.map((floor, floorIndex) => ({
        ...floor,
        cells: floor.cells.map((row, rowIndex) =>
          row.map((cell, colIndex): FloorCell =>
            floorIndex === FLOOR_PLAN_LIMITS.maxFloors - 1 && rowIndex === 95 && colIndex === 95
              ? { kind: "machine", categoryId: "cat-1", label: "Last" }
              : cell
          )
        ),
      })),
    };

    const totalCells = 96 * 96 * FLOOR_PLAN_LIMITS.maxFloors;
    expect(totalCells).toBe(55296);
    expect(totalCells - 1).toBe(55295);

    const decoded = decodePlanBytes(encodePlanBytes(labelled));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.plan.floors[5].cells[95][95]).toEqual({
      kind: "machine",
      categoryId: "cat-1",
      label: "Last",
    });
  });

  it("keeps the absolute worst case storable", () => {
    // Every square of every floor a labelled machine at the ceiling: the
    // largest payload the module can produce through its public API.
    const rows = FLOOR_PLAN_LIMITS.maxRows;
    const cols = FLOOR_PLAN_LIMITS.maxCols;
    const floors = FLOOR_PLAN_LIMITS.maxFloors;
    const plan: GymFloorPlan = {
      ...createEmptyPlan({ rows, cols }),
      categories: [
        { id: "cat-1", name: "Machines", color: "#2563EB", shortLabel: "M", pattern: "solid" },
      ],
      floors: Array.from({ length: floors }, (_, floorIndex) => ({
        id: `floor-${floorIndex + 1}`,
        name: `Floor ${floorIndex + 1}`,
        rows,
        cols,
        cells: Array.from({ length: rows }, (_, row) =>
          Array.from({ length: cols }, (_, col): FloorCell => ({
            kind: "machine",
            categoryId: "cat-1",
            label: `M${row}-${col}`,
          }))
        ),
      })),
    };

    const payload = encodePlanBytes(plan);
    // 55 296 cells, every one a labelled machine: ~533 KiB. The storage layer's
    // payload cap is 8 MiB, so the worst plan the limits allow fits with room
    // to spare — that is what makes 96 × 96 safe to offer.
    expect(payload.byteLength).toBeGreaterThan(500_000);
    expect(payload.byteLength).toBeLessThan(8 * 1024 * 1024);

    const decoded = decodePlanBytes(payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.plan.floors[floors - 1].cells[rows - 1][cols - 1]).toEqual({
      kind: "machine",
      categoryId: "cat-1",
      label: `M${rows - 1}-${cols - 1}`,
    });
  });

  it("rejects 97 × 97, one past the ceiling", () => {
    const plan = createEmptyPlan({ rows: 96, cols: 96 });
    const tooBig: GymFloorPlan = {
      ...plan,
      floors: [{ ...plan.floors[0], rows: 97, cols: 97 }],
    };
    expectCode(() => createEmptyPlan({ rows: 97 }), "invalid-dimensions");
    expectCode(() => encodePlanBytes(tooBig), "invalid-plan");
    expectCode(() => serializePlan(tooBig), "invalid-plan");
  });
});

describe("getCellAppearance", () => {
  it("reads one cell without building the whole model", () => {
    const appearance = getCellAppearance(samplePlan(), "floor-1", 1, 1);
    expect(appearance.kind).toBe("void");
    expect(appearance.ariaLabel).toBe("Row 2, column 2: unavailable");
  });

  it("rejects out-of-bounds coordinates and unknown floors", () => {
    expectCode(() => getCellAppearance(samplePlan(), "floor-1", 3, 0), "out-of-bounds");
    expectCode(() => getCellAppearance(samplePlan(), "floor-1", 0, 4), "out-of-bounds");
    expectCode(() => getCellAppearance(samplePlan(), "missing", 0, 0), "unknown-floor");
  });

  it("agrees with the model's describeCell for every square", () => {
    const plan = samplePlan();
    const model = buildFloorRenderModel(plan, "floor-1");
    for (let row = 0; row < model.rows; row += 1) {
      for (let col = 0; col < model.cols; col += 1) {
        const one = getCellAppearance(plan, "floor-1", row, col);
        expect(model.describeCell(row, col)).toEqual({
          ariaLabel: one.ariaLabel,
          tooltip: one.tooltip,
        });
        expect(model.appearanceAt(row, col)).toEqual({
          kind: one.kind,
          categoryId: one.categoryId,
          color: one.color,
          inkColor: one.inkColor,
          shortLabel: one.shortLabel,
          pattern: one.pattern,
        });
      }
    }
  });
});

describe("accessibility", () => {
  it("never relies on colour alone", () => {
    const plan = samplePlan();
    const model = buildFloorRenderModel(plan, "floor-1");

    for (let row = 0; row < model.rows; row += 1) {
      for (let col = 0; col < model.cols; col += 1) {
        const appearance = model.appearanceAt(row, col);
        const described = model.describeCell(row, col);
        expect(described?.ariaLabel.length).toBeGreaterThan(0);
        if (appearance?.kind === "machine") {
          expect(appearance.shortLabel.length).toBeGreaterThan(0);
        }
        if (appearance?.kind === "void") {
          expect(appearance.shortLabel).toBe("×");
        }
      }
    }

    for (const entry of model.legend) {
      expect(entry.shortLabel.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it("accepts localised labels without forking the module", () => {
    const greek: FloorPlanLabels = {
      unavailable: "μη διαθέσιμο",
      openFloor: "ελεύθερος χώρος",
      equipment: "εξοπλισμός",
      row: "Σειρά",
      column: "στήλη",
      noEquipment: "χωρίς εξοπλισμό",
      unknownCategory: "άγνωστη κατηγορία",
    };

    const plan = samplePlan();
    const model = buildFloorRenderModel(plan, "floor-1", undefined, greek);

    expect(model.describeCell(0, 0)?.ariaLabel).toBe(
      "Σειρά 1, στήλη 1: Impulse machines — Chest press"
    );
    expect(getCellAppearance(plan, "floor-1", 0, 0, undefined, greek).ariaLabel).toBe(
      "Σειρά 1, στήλη 1: Impulse machines — Chest press"
    );

    const summary = describeFloor(plan, "floor-1", greek);
    expect(summary).toContain("εξοπλισμός");
    expect(summary).toContain("μη διαθέσιμο");
    expect(summary).toContain("ελεύθερος χώρος");
  });
});
