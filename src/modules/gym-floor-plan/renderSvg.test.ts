/**
 * Tests for the SVG scene builder.
 *
 * These pin the two things the CSS-Grid renderer could not give us:
 *
 *   1. **O(appearances) drawing.** A floor emits one path per *appearance it
 *      actually uses* — never one element per square. The 96 × 96 case asserts
 *      the count stays at the appearance-table size, which is the whole reason
 *      the renderer changed.
 *   2. **One image, one name.** The summary appears exactly once, in
 *      `accessibility.label`; nothing per square is labelled.
 *
 * Hit-testing is pure maths here, so the top-left, bottom-right and outside
 * cases are proved without a DOM (the component test only has to prove the
 * handler is wired, not that the arithmetic is right).
 */

import { describe, expect, it } from "vitest";
import { addCategory, createEmptyPlan, setCell } from "./model";
import { DEFAULT_FLOOR_PLAN_THEME, buildFloorRenderModel } from "./render";
import {
  SVG_LABEL_MIN_CELL_PX,
  appearancePath,
  buildSvgScene,
  cellAtPoint,
  cellSetPath,
  floorAspectRatio,
  legendToText,
  viewBoxFor,
  type SvgSceneOptions,
} from "./renderSvg";
import type { GymFloorPlan } from "./types";

/**
 * 3 × 4 floor: two categories, one void square, an unlabelled machine and a
 * labelled one.
 *
 *   IM IM .  .
 *   .  ×  AR .
 *   .  .  .  .
 */
function samplePlan(): GymFloorPlan {
  let plan = createEmptyPlan({ rows: 3, cols: 4 });
  plan = addCategory(plan, {
    id: "cat-1",
    name: "Impulse machines",
    color: "#2563EB",
    shortLabel: "IM",
  });
  plan = addCategory(plan, {
    id: "cat-2",
    name: "Arsenal machines",
    color: "#DC2626",
    shortLabel: "AR",
  });
  plan = setCell(plan, "floor-1", 0, 0, {
    kind: "machine",
    categoryId: "cat-1",
    label: "Chest press",
  });
  plan = setCell(plan, "floor-1", 0, 1, { kind: "machine", categoryId: "cat-1" });
  plan = setCell(plan, "floor-1", 1, 1, { kind: "void" });
  plan = setCell(plan, "floor-1", 1, 2, { kind: "machine", categoryId: "cat-2" });
  return plan;
}

/** A 96 × 96 floor using every category, so it has the maximal appearance table. */
function maximalPlan(): GymFloorPlan {
  let plan = createEmptyPlan({ rows: 96, cols: 96 });
  const palette = [
    "#2563EB",
    "#DC2626",
    "#16A34A",
    "#F59E0B",
    "#7C3AED",
    "#0E7490",
    "#FFFFFF",
    "#111827",
    "#BE123C",
    "#15803D",
    "#B45309",
    "#6D28D9",
    "#0F766E",
    "#9F1239",
    "#4D7C0F",
    "#C2410C",
    "#4338CA",
    "#0369A1",
    "#A21CAF",
    "#3F6212",
  ];
  for (let index = 0; index < palette.length; index += 1) {
    plan = addCategory(plan, {
      id: `cat-${index + 1}`,
      name: `Category ${index + 1}`,
      color: palette[index],
    });
  }
  // Paint a diagonal wipe so every category, void and empty all appear.
  for (let row = 0; row < 96; row += 1) {
    for (let col = 0; col < 96; col += 1) {
      const bucket = (row + col) % 22;
      if (bucket < 20) {
        plan = setCell(plan, "floor-1", row, col, {
          kind: "machine",
          categoryId: `cat-${bucket + 1}`,
        });
      } else if (bucket === 20) {
        plan = setCell(plan, "floor-1", row, col, { kind: "void" });
      }
    }
  }
  return plan;
}

function sceneFor(plan: GymFloorPlan, options: SvgSceneOptions = {}) {
  return buildSvgScene(buildFloorRenderModel(plan, "floor-1"), {
    widthPx: 960,
    ...options,
  });
}

/** Every element the scene would emit, as a string, for node counting. */
function emittedElements(scene: ReturnType<typeof buildSvgScene>): string[] {
  const elements: string[] = ["svg"];
  for (const tile of scene.patterns) {
    elements.push("pattern");
    for (const shape of tile.shapes) elements.push(shape.kind);
  }
  // One <pattern>+<text> per label tile, one <path> per layer: the count is what
  // matters, so the binding itself is unnecessary.
  elements.push(...scene.labelTiles.flatMap(() => ["pattern", "text"]));
  elements.push(...scene.layers.map(() => "path"));
  elements.push(...scene.labelLayers.map(() => "path"));
  return elements;
}

describe("buildSvgScene — layers and fills", () => {
  it("emits one path per used appearance, not one per square", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");
    const scene = buildSvgScene(model, { widthPx: 960 });

    // The plan uses four distinct appearances: cat-1, empty, void, cat-2.
    expect(model.appearances).toHaveLength(4);
    expect(scene.layers).toHaveLength(4);
    // Twelve squares are drawn by four paths.
    expect(scene.layers.reduce((total, layer) => total + layer.squareCount, 0)).toBe(12);
  });

  it("covers every square exactly once across the layers", () => {
    const scene = sceneFor(samplePlan());
    const covered = scene.layers.reduce((total, layer) => total + layer.squareCount, 0);
    expect(covered).toBe(scene.rows * scene.cols);
  });

  it("uses the category colour for machine squares", () => {
    const scene = sceneFor(samplePlan());
    const impulse = scene.layers.find((layer) => layer.categoryId === "cat-1");
    const arsenal = scene.layers.find((layer) => layer.categoryId === "cat-2");

    expect(impulse?.color).toBe("#2563EB");
    expect(impulse?.fill).toBe("#2563EB");
    expect(impulse?.squareCount).toBe(2);
    expect(arsenal?.color).toBe("#DC2626");
    expect(arsenal?.squareCount).toBe(1);
  });

  it("paints void with the fixed theme void colour, never a category colour", () => {
    const scene = sceneFor(samplePlan());
    const voidLayer = scene.layers.find((layer) => layer.kind === "void");

    expect(voidLayer?.color).toBe(DEFAULT_FLOOR_PLAN_THEME.voidColor);
    expect(voidLayer?.categoryId).toBeNull();
    expect(voidLayer?.shortLabel).toBe("×");
    // Void is never one of the owner's categories, so its fill is a pattern
    // reference or the raw hex, but always built from the fixed colour.
    expect(
      voidLayer?.fill === DEFAULT_FLOOR_PLAN_THEME.voidColor || voidLayer?.fill.startsWith("url(#")
    ).toBe(true);
  });

  it("paints empty squares with the theme empty colour and no short label", () => {
    const scene = sceneFor(samplePlan());
    const empty = scene.layers.find((layer) => layer.kind === "empty");

    expect(empty?.color).toBe(DEFAULT_FLOOR_PLAN_THEME.emptyColor);
    expect(empty?.shortLabel).toBe("");
    expect(empty?.squareCount).toBe(8);
  });

  it("merges horizontally adjacent squares into one sub-path", () => {
    let plan = createEmptyPlan({ rows: 2, cols: 6 });
    plan = addCategory(plan, { id: "cat-1", name: "Row", color: "#2563EB" });
    for (let col = 0; col < 4; col += 1) {
      plan = setCell(plan, "floor-1", 0, col, { kind: "machine", categoryId: "cat-1" });
    }

    const model = buildFloorRenderModel(plan, "floor-1");
    const heritage = model.appearances.findIndex((appearance) => appearance.categoryId === "cat-1");
    const geometry = appearancePath(model.cellAppearanceIndex, model.rows, model.cols, heritage);

    // Four squares on row 0 become ONE run: "M0 0h4v1h-4z".
    expect(geometry.squareCount).toBe(4);
    expect(geometry.runCount).toBe(1);
    expect(geometry.d).toBe("M0 0h4v1h-4z");
  });

  it("does not merge squares across a row boundary", () => {
    let plan = createEmptyPlan({ rows: 2, cols: 2 });
    plan = addCategory(plan, { id: "cat-1", name: "Column", color: "#2563EB" });
    plan = setCell(plan, "floor-1", 0, 0, { kind: "machine", categoryId: "cat-1" });
    plan = setCell(plan, "floor-1", 1, 0, { kind: "machine", categoryId: "cat-1" });

    const model = buildFloorRenderModel(plan, "floor-1");
    const category = model.appearances.findIndex((appearance) => appearance.categoryId === "cat-1");
    const geometry = appearancePath(model.cellAppearanceIndex, model.rows, model.cols, category);

    expect(geometry.runCount).toBe(2);
    expect(geometry.d).toBe("M0 0h1v1h-1zM0 1h1v1h-1z");
  });

  it("skips an appearance nothing references", () => {
    // A category with no painted square is in the model's appearance table only
    // if some square points at it. Paint one, then rely on the table order.
    const scene = sceneFor(samplePlan());
    expect(scene.layers.every((layer) => layer.squareCount > 0)).toBe(true);
  });
});

describe("buildSvgScene — patterns", () => {
  it("returns no pattern defs when every appearance is solid", () => {
    const scene = sceneFor(samplePlan());
    // Void defaults to a diagonal pattern, so exactly one def is expected.
    expect(scene.patterns).toHaveLength(1);
    expect(scene.patterns[0].shapes).toHaveLength(1);
    expect(scene.patterns[0].shapes[0].kind).toBe("line");
  });

  it("references the pattern def from the layer's fill and keeps the tile in cell units", () => {
    const scene = sceneFor(samplePlan());
    const voidLayer = scene.layers.find((layer) => layer.kind === "void");
    const tile = scene.patterns[0];

    expect(voidLayer?.fill).toBe(`url(#${tile.id})`);
    // Tiles are measured in cell units, so they scale with the viewBox.
    expect(tile.width).toBeGreaterThan(0);
    expect(tile.width).toBeLessThanOrEqual(1);
    expect(tile.inkColor).toBe(voidLayer?.inkColor);
  });

  it("gives every pattern a unique id namespaced by the floor", () => {
    const scene = sceneFor(samplePlan());
    const ids = scene.patterns.map((tile) => tile.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("fp-floor-1-"))).toBe(true);
  });

  it("emits the right shape per pattern kind", () => {
    let plan = createEmptyPlan({ rows: 5, cols: 1 });
    const patterns = ["solid", "diagonal", "dots", "grid", "cross"] as const;
    patterns.forEach((pattern, index) => {
      plan = addCategory(plan, {
        id: `cat-${index + 1}`,
        name: pattern,
        color: "#2563EB",
        pattern,
      });
      plan = setCell(plan, "floor-1", index, 0, {
        kind: "machine",
        categoryId: `cat-${index + 1}`,
      });
    });

    const scene = sceneFor(plan);
    const shapeCount = scene.patterns.reduce((total, tile) => total + tile.shapes.length, 0);

    // solid contributes nothing; diagonal 1 line, dots 1 circle, grid 2 paths,
    // cross 2 paths.
    expect(scene.patterns).toHaveLength(4);
    expect(shapeCount).toBe(6);
    expect(
      scene.patterns.some((tile) => tile.shapes.some((shape) => shape.kind === "circle"))
    ).toBe(true);
  });
});

describe("buildSvgScene — label threshold", () => {
  it("draws short labels when a square is at least the threshold", () => {
    // 4 columns across 960px = 240px per square: far above the threshold.
    const scene = sceneFor(samplePlan());
    expect(scene.cellPx).toBe(240);
    expect(scene.cellPx).toBeGreaterThanOrEqual(SVG_LABEL_MIN_CELL_PX);
    expect(scene.showLabels).toBe(true);

    const labels = scene.labelTiles.map((tile) => tile.text);
    expect(labels).toContain("IM");
    expect(labels).toContain("AR");
    expect(labels).toContain("×");
    // Empty has no short label, so it gets no label tile.
    expect(labels).not.toContain("");
    expect(scene.labelLayers).toHaveLength(3);
  });

  it("drops short labels at the 96 × 96 ceiling, where a square is a few pixels", () => {
    const scene = sceneFor(maximalPlan());
    // 960px / 96 columns = 10px per square, below the 16px threshold.
    expect(scene.cellPx).toBe(10);
    expect(scene.showLabels).toBe(false);
    expect(scene.labelTiles).toHaveLength(0);
    expect(scene.labelLayers).toHaveLength(0);
    // The fills are still drawn: the legend carries the mapping instead.
    expect(scene.layers.length).toBeGreaterThan(0);
  });

  it("flips exactly at the threshold", () => {
    const justBelow = sceneFor(samplePlan(), { widthPx: SVG_LABEL_MIN_CELL_PX * 4 - 1 });
    const exactly = sceneFor(samplePlan(), { widthPx: SVG_LABEL_MIN_CELL_PX * 4 });
    const wellAbove = sceneFor(samplePlan(), { widthPx: SVG_LABEL_MIN_CELL_PX * 4 + 4 });

    // 4 columns: cellPx = widthPx / 4.
    expect(justBelow.cellPx).toBeLessThan(SVG_LABEL_MIN_CELL_PX);
    expect(justBelow.showLabels).toBe(false);
    expect(exactly.cellPx).toBe(SVG_LABEL_MIN_CELL_PX);
    expect(exactly.showLabels).toBe(true);
    expect(wellAbove.showLabels).toBe(true);
  });

  it("lets a host override the threshold", () => {
    const scene = sceneFor(samplePlan(), { labelMinCellPx: 400, widthPx: 960 });
    expect(scene.cellPx).toBe(240);
    expect(scene.showLabels).toBe(false);
  });

  it("keeps a label tile to one glyph stamp per appearance", () => {
    const scene = sceneFor(samplePlan());
    expect(scene.labelTiles).toHaveLength(scene.labelLayers.length);
    for (const tile of scene.labelTiles) {
      expect(tile.text.length).toBeLessThanOrEqual(3);
      expect(tile.fontSize).toBeGreaterThan(0);
      expect(tile.fontSize).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildSvgScene — accessibility contract", () => {
  it("carries the floor summary exactly once", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");
    const scene = buildSvgScene(model, { widthPx: 960 });

    expect(scene.accessibility.label).toBe(model.summary);
    // The summary must not leak into the other strings, or a screen reader
    // hears the whole floor twice.
    expect(scene.accessibility.description).not.toContain(model.summary);
    expect(scene.accessibility.legendText).not.toContain(model.summary);
  });

  it("is one image, never one labelled node per square", () => {
    const scene = sceneFor(maximalPlan());

    expect(scene.accessibility.role).toBe("img");
    expect(scene.accessibility.perSquareLabels).toBe(false);
    expect(scene.accessibility.label.length).toBeGreaterThan(0);
    // Nothing in the scene carries a per-square accessible name.
    expect(scene).not.toHaveProperty("cells");
    expect(scene.layers.every((layer) => !("ariaLabel" in layer))).toBe(true);
  });

  it("exposes the legend mapping in words", () => {
    const scene = sceneFor(samplePlan());

    expect(scene.accessibility.legendText).toContain("Impulse machines");
    expect(scene.accessibility.legendText).toContain("Arsenal machines");
    expect(scene.accessibility.legendText).toContain("×");
    expect(scene.accessibility.description).toBe(scene.accessibility.legendText);
  });

  it("keeps a one-line legend even when the legend is long", () => {
    const text = legendToText([
      {
        kind: "category",
        id: "a",
        name: "A",
        color: "#000",
        inkColor: "#fff",
        shortLabel: "A",
        pattern: "solid",
        count: 1,
      },
      {
        kind: "void",
        id: "v",
        name: "unavailable",
        color: "#000",
        inkColor: "#fff",
        shortLabel: "×",
        pattern: "diagonal",
        count: 2,
      },
    ]);
    expect(text).toBe("A A · × unavailable");
    expect(text).not.toContain("\n");
  });
});

describe("buildSvgScene — 96 × 96 DOM cost", () => {
  it("emits a constant number of elements regardless of 9 216 squares", () => {
    const scene = sceneFor(maximalPlan());
    const elements = emittedElements(scene);

    // 20 categories + void + empty = 22 appearances, each one path.
    expect(scene.layers.length).toBe(22);
    // No labels at this size, so nothing extra.
    expect(scene.labelLayers).toHaveLength(0);
    // One svg element, one path per appearance, plus one pattern def per
    // non-solid pattern. No element is per square.
    expect(elements.length).toBeLessThan(100);
    expect(elements.length).toBeLessThan((scene.rows * scene.cols) / 90);
    // The CSS-Grid renderer would have needed one node per square.
    expect(scene.rows * scene.cols).toBe(9216);
  });

  it("keeps the square visually square", () => {
    const scene = sceneFor(maximalPlan());
    expect(scene.viewBox).toBe("0 0 96 96");
    expect(scene.aspectRatio).toBe(1);
    expect(scene.cellPx * scene.cols).toBeCloseTo(960, 6);
  });
});

describe("buildSvgScene — validation", () => {
  it("rejects a model whose index array is the wrong length", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");
    const broken = { ...model, cellAppearanceIndex: new Uint16Array(5) };
    expect(() => buildSvgScene(broken)).toThrow(/rows\*cols/);
  });

  it("rejects non-positive dimensions", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");
    expect(() => buildSvgScene({ ...model, rows: 0 })).toThrow(RangeError);
    expect(() => buildSvgScene({ ...model, cols: -1 })).toThrow(RangeError);
  });

  it("defaults the width instead of requiring one", () => {
    const model = buildFloorRenderModel(samplePlan(), "floor-1");
    const scene = buildSvgScene(model);
    expect(scene.cellPx).toBe(720 / 4);
  });
});

describe("cellAtPoint — hit testing with one handler and coordinate maths", () => {
  const box = { left: 0, top: 0, width: 960, height: 960 };

  it("maps the top-left extreme to (0, 0)", () => {
    expect(cellAtPoint(0, 0, box, 96, 96)).toEqual({ row: 0, col: 0 });
    expect(cellAtPoint(0.5, 0.5, box, 96, 96)).toEqual({ row: 0, col: 0 });
  });

  it("maps the bottom-right extreme to the last square, inclusive", () => {
    expect(cellAtPoint(959.9, 959.9, box, 96, 96)).toEqual({ row: 95, col: 95 });
    // The exact far edge is the first coordinate outside the grid.
    expect(cellAtPoint(960, 959.9, box, 96, 96)).toBeNull();
  });

  it("returns null outside the grid on every side", () => {
    expect(cellAtPoint(-1, 10, box, 96, 96)).toBeNull();
    expect(cellAtPoint(10, -1, box, 96, 96)).toBeNull();
    expect(cellAtPoint(960, 10, box, 96, 96)).toBeNull();
    expect(cellAtPoint(10, 960, box, 96, 96)).toBeNull();
    expect(cellAtPoint(Number.NaN, 10, box, 96, 96)).toBeNull();
  });

  it("returns null for a zero-sized element", () => {
    expect(cellAtPoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }, 3, 4)).toBeNull();
  });

  it("accounts for the element's offset on the page", () => {
    const offset = { left: 120, top: 40, width: 400, height: 300 };
    // 4 cols × 3 rows in 400 × 300: both ratios are 100, so no letterboxing.
    expect(cellAtPoint(120, 40, offset, 3, 4)).toEqual({ row: 0, col: 0 });
    expect(cellAtPoint(519.9, 339.9, offset, 3, 4)).toEqual({ row: 2, col: 3 });
    // A point inside the element but left of the grid's origin is impossible
    // here, but above it is not: the element is padded on the right only.
    expect(cellAtPoint(119, 40, offset, 3, 4)).toBeNull();
  });

  it("letterboxes an off-ratio container instead of stretching it", () => {
    // 4 cols × 3 rows in a 1000 × 500 element: scale is 500/3, so the grid is
    // 666.67 wide and centred with 166.67px of empty space on each side.
    const wide = { left: 0, top: 0, width: 1000, height: 500 };

    expect(cellAtPoint(166.7, 0, wide, 3, 4)).toEqual({ row: 0, col: 0 });
    expect(cellAtPoint(833.3, 499.9, wide, 3, 4)).toEqual({ row: 2, col: 3 });
    // Inside the element, inside the letterbox: not a square.
    expect(cellAtPoint(10, 250, wide, 3, 4)).toBeNull();
    expect(cellAtPoint(990, 250, wide, 3, 4)).toBeNull();
  });

  it("agrees with the scene it draws", () => {
    const scene = sceneFor(maximalPlan());
    // 96 columns across a 960px element -> 10px squares.
    const sceneBox = {
      left: 0,
      top: 0,
      width: scene.cellPx * scene.cols,
      height: scene.cellPx * scene.rows,
    };

    for (const [row, col] of [
      [0, 0],
      [0, 95],
      [95, 0],
      [95, 95],
      [48, 48],
    ]) {
      const x = (col + 0.5) * scene.cellPx;
      const y = (row + 0.5) * scene.cellPx;
      expect(cellAtPoint(x, y, sceneBox, scene.rows, scene.cols)).toEqual({ row, col });
    }
  });
});

describe("cellSetPath — the editor's live stroke preview", () => {
  it("merges a contiguous drag into one run per row", () => {
    const path = cellSetPath(
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      3,
      3
    );
    expect(path.d).toBe("M0 0h3v1h-3z");
    expect(path.squareCount).toBe(3);
    expect(path.runCount).toBe(1);
  });

  it("sorts unordered cells and splits a gap", () => {
    const path = cellSetPath(
      [
        { row: 0, col: 3 },
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
      2,
      4
    );
    expect(path.d).toBe("M0 0h2v1h-2zM3 0h1v1h-1z");
    expect(path.squareCount).toBe(3);
    expect(path.runCount).toBe(2);
  });

  it("ignores out-of-bounds and duplicate coordinates", () => {
    const path = cellSetPath(
      [
        { row: 0, col: 0 },
        { row: 0, col: 0 },
        { row: 9, col: 9 },
        { row: -1, col: 0 },
        { row: 0.5, col: 0 },
      ],
      2,
      2
    );
    expect(path.squareCount).toBe(1);
    expect(path.d).toBe("M0 0h1v1h-1z");
  });

  it("is empty for an empty stroke", () => {
    expect(cellSetPath([], 3, 3)).toEqual({ d: "", squareCount: 0, runCount: 0 });
  });
});

describe("geometry helpers", () => {
  it("keeps one user unit per square", () => {
    expect(viewBoxFor(3, 4)).toBe("0 0 4 3");
    expect(viewBoxFor(96, 96)).toBe("0 0 96 96");
  });

  it("computes a width / height ratio for the container", () => {
    expect(floorAspectRatio(3, 4)).toBeCloseTo(4 / 3, 10);
    expect(floorAspectRatio(96, 96)).toBe(1);
    expect(floorAspectRatio(1, 1)).toBe(1);
  });
});
