import { describe, expect, it } from "vitest";
import { FloorPlanError } from "./model";
import { addCategory, createEmptyPlan, setCell } from "./model";
import {
  DEFAULT_FLOOR_PLAN_LABELS,
  DEFAULT_FLOOR_PLAN_THEME,
  PRINT_FLOOR_PLAN_THEME,
  buildFloorRenderModel,
  buildLegend,
  describeFloor,
  getCellAppearance,
  getGridTemplate,
  getInkColor,
  patternToBackground,
} from "./render";
import type { CellPattern, FloorCell, FloorPlanLabels, GymFloorPlan } from "./types";

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

describe("getGridTemplate", () => {
  it("keeps square cells with minmax(0, 1fr) tracks", () => {
    const grid = getGridTemplate(3, 4);
    expect(grid.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(grid.gridTemplateRows).toBe("repeat(3, minmax(0, 1fr))");
    expect(grid.aspectRatio).toBe("4 / 3");
  });

  it("rejects dimensions outside the module limits", () => {
    expectCode(() => getGridTemplate(0, 4), "invalid-dimensions");
    expectCode(() => getGridTemplate(3, 41), "invalid-dimensions");
    expectCode(() => getGridTemplate(2.5, 4), "invalid-dimensions");
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

describe("buildFloorRenderModel", () => {
  it("produces row-major cells with colour, secondary label and aria text", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");

    expect(model.floorId).toBe("floor-1");
    expect(model.floorName).toBe("Ground floor");
    expect(model.rows).toBe(3);
    expect(model.cols).toBe(4);
    expect(model.cells).toHaveLength(12);

    const machine = model.cells[0];
    expect(machine).toMatchObject({
      row: 0,
      col: 0,
      kind: "machine",
      categoryId: "cat-1",
      color: "#2563EB",
      shortLabel: "IM",
      pattern: "solid",
    });
    expect(machine.ariaLabel).toBe("Row 1, column 1: Impulse machines — Chest press");
    expect(machine.tooltip).toBe("Impulse machines — Chest press");

    const empty = model.cells[1];
    expect(empty).toMatchObject({
      row: 0,
      col: 1,
      kind: "empty",
      color: DEFAULT_FLOOR_PLAN_THEME.emptyColor,
      shortLabel: "",
    });

    const voidCell = model.cells[5];
    expect(voidCell).toMatchObject({
      row: 1,
      col: 1,
      kind: "void",
      color: DEFAULT_FLOOR_PLAN_THEME.voidColor,
      shortLabel: "×",
      pattern: "diagonal",
    });
    expect(voidCell.ariaLabel).toContain("unavailable");

    expect(model.cells[11]).toMatchObject({ row: 2, col: 3 });
  });

  it("carries the grid template, legend and summary", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");

    expect(model.grid).toEqual(getGridTemplate(3, 4));
    expect(model.legend).toHaveLength(3);
    expect(model.summary).toBe(describeFloor(samplePlan(), "floor-1"));
  });

  it("rejects an unknown floor", () => {
    expectCode(() => buildFloorRenderModel(samplePlan(), "missing"), "unknown-floor");
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

    const appearance = getCellAppearance(bad, "floor-1", 0, 0);
    expect(appearance.color).toBe("#DC2626");
    expect(appearance.shortLabel).toBe("?");
    expect(appearance.ariaLabel).toContain(DEFAULT_FLOOR_PLAN_LABELS.unknownCategory);
  });
});

describe("accessibility", () => {
  it("never relies on colour alone", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");

    for (const cell of model.cells) {
      expect(cell.ariaLabel.length).toBeGreaterThan(0);
      if (cell.kind === "machine") {
        expect(cell.shortLabel.length).toBeGreaterThan(0);
        expect(cell.ariaLabel).toContain("Impulse machines");
      }
      if (cell.kind === "void") {
        expect(cell.shortLabel).toBe("×");
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

    const appearance = getCellAppearance(samplePlan(), "floor-1", 0, 0, undefined, greek);
    expect(appearance.ariaLabel).toBe("Σειρά 1, στήλη 1: Impulse machines — Chest press");

    const summary = describeFloor(samplePlan(), "floor-1", greek);
    expect(summary).toContain("εξοπλισμός");
    expect(summary).toContain("μη διαθέσιμο");
    expect(summary).toContain("ελεύθερος χώρος");
  });
});
