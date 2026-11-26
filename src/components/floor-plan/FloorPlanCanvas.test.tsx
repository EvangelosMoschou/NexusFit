// @vitest-environment jsdom
/**
 * Component tests for the SVG floor-plan canvas.
 *
 * The pure scene builder is covered in `src/modules/gym-floor-plan/renderSvg.test.ts`.
 * This file covers what only a DOM can prove:
 *
 *   1. **Node count.** A 96 × 96 floor renders a constant handful of elements,
 *      not 9 216. That is the reason the renderer changed.
 *   2. **Hit-testing through the real handler path** — one pointer listener on
 *      the `<svg>`, `getBoundingClientRect()` + coordinate maths. jsdom reports
 *      a zero-sized box, so each test installs a rect exactly the way a browser
 *      would report one.
 *   3. **Accessibility.** One image, one accessible name, one legend, and the
 *      editor's single focus target.
 *
 * `getBoundingClientRect` is stubbed on the SVG element rather than on the
 * prototype so a test cannot leak a fake geometry into the next one.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import {
  DEFAULT_FLOOR_PLAN_LABELS,
  DEFAULT_FLOOR_PLAN_THEME,
  addCategory,
  createEmptyPlan,
  setCell,
  type GymFloorPlan as GymFloorPlanData,
} from "@/modules/gym-floor-plan";
import { FloorPlanCanvas } from "@/components/floor-plan/FloorPlanCanvas";

afterEach(cleanup);

/** A 3 × 4 floor: two categories, one void, one unlabelled machine, rest empty. */
function buildPlan(rows = 3, cols = 4): GymFloorPlanData {
  let plan = createEmptyPlan({ rows, cols });
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
  plan = setCell(plan, "floor-1", 0, 0, { kind: "machine", categoryId: "cat-1" });
  plan = setCell(plan, "floor-1", 0, 1, { kind: "machine", categoryId: "cat-2" });
  plan = setCell(plan, "floor-1", 1, 2, { kind: "void" });
  return plan;
}

function renderCanvas(overrides: Partial<React.ComponentProps<typeof FloorPlanCanvas>> = {}) {
  const plan = overrides.plan ?? buildPlan();
  return render(
    <FloorPlanCanvas
      plan={plan}
      floorId="floor-1"
      theme={DEFAULT_FLOOR_PLAN_THEME}
      labels={DEFAULT_FLOOR_PLAN_LABELS}
      {...overrides}
    />
  );
}

/**
 * Gives the SVG a box the way a browser would: `width` × `height` at the
 * origin. `preserveAspectRatio="xMidYMid meet"` then letterboxes if the ratio
 * does not match, which is exactly the maths under test.
 */
function stubRect(svg: SVGSVGElement, width: number, height: number, left = 0, top = 0): void {
  svg.getBoundingClientRect = () =>
    ({
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    }) as DOMRect;
}

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) throw new Error("expected an <svg> renderer");
  return svg;
}

describe("FloorPlanCanvas — SVG structure", () => {
  it("renders one svg with one path per appearance, not one node per square", () => {
    const { container } = renderCanvas();
    const svg = svgOf(container);

    // 3 × 4 = 12 squares, drawn by 4 appearance paths (cat-1, cat-2, void, empty).
    const fills = svg.querySelectorAll("path");
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    // 4 fill layers + 3 label layers (IM, AR, ×) + the single grid-line path.
    // Twelve squares, eight paths — and no per-square element at all.
    expect(fills.length).toBe(8);
    expect(fills.length).toBeLessThan(12);
    expect(container.querySelectorAll("div[data-row], div[data-col]")).toHaveLength(0);
  });

  it("renders a 96 × 96 floor with a constant node count", () => {
    const { container } = renderCanvas({ plan: buildPlan(96, 96) });
    const svg = svgOf(container);

    const nodes = svg.querySelectorAll("*").length;
    // 9 216 squares, well under 100 elements. The CSS-Grid renderer needed
    // 9 217.
    expect(nodes).toBeLessThan(100);
    expect(nodes).toBeGreaterThan(0);

    // And nothing in the tree is a tab stop or a labelled per-square node.
    expect(svg.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(container.querySelectorAll("[role='button']")).toHaveLength(0);
    expect(svg.querySelectorAll("[aria-label]")).toHaveLength(0);
  });

  it("keeps the squares square with a viewBox and preserveAspectRatio", () => {
    const { container } = renderCanvas();
    const svg = svgOf(container);

    expect(svg.getAttribute("viewBox")).toBe("0 0 4 3");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });

  it("uses the fixed void colour and the theme empty colour", () => {
    const { container } = renderCanvas();
    const svg = svgOf(container);
    const fills = [...svg.querySelectorAll("path")].map((path) => path.getAttribute("fill"));

    // Void defaults to a diagonal pattern, so it is a url(#…) reference whose
    // def is the void ink; empty is the theme colour directly.
    expect(fills).toContain(DEFAULT_FLOOR_PLAN_THEME.emptyColor);
    expect(fills).toContain("#2563EB");
    expect(fills).toContain("#DC2626");
    expect(fills.some((fill) => fill?.startsWith("url(#"))).toBe(true);
  });
  it("renders pattern backgrounds, shape-level opacity without non-scaling-stroke, and print theme hooks", () => {
    let plan = buildPlan();
    plan = addCategory(plan, {
      id: "cat-3",
      name: "Dots category",
      color: "#16A34A",
      shortLabel: "DT",
      pattern: "dots",
    });
    plan = setCell(plan, "floor-1", 2, 0, { kind: "machine", categoryId: "cat-3" });

    const { container } = renderCanvas({ plan });
    const svg = svgOf(container);

    const patternDefs = [...svg.querySelectorAll("defs > pattern")].filter(
      (node) => node.querySelector("rect[data-pattern-bg]") !== null
    );
    expect(patternDefs).toHaveLength(2);

    for (const pattern of patternDefs) {
      // Opacity must live on the child shapes, not on <pattern>.
      expect(pattern.getAttribute("opacity")).toBeNull();
    }

    const bgRects = [...svg.querySelectorAll<SVGRectElement>("rect[data-pattern-bg]")];
    expect(bgRects.map((rect) => rect.getAttribute("fill"))).toEqual(
      expect.arrayContaining([DEFAULT_FLOOR_PLAN_THEME.voidColor, "#16A34A"])
    );

    const voidBg = bgRects.find((rect) => rect.getAttribute("fill") === DEFAULT_FLOOR_PLAN_THEME.voidColor);
    expect(voidBg?.style.fill).toBe("var(--fp-void)");

    const machineBg = bgRects.find((rect) => rect.getAttribute("fill") === "#16A34A");
    expect(machineBg?.style.fill).toBe("");

    // Pattern lines/paths scale with cell units (no non-scaling-stroke) and use stroke-opacity.
    const voidLine = svg.querySelector("pattern line");
    expect(voidLine?.getAttribute("vector-effect")).toBeNull();
    expect(voidLine?.getAttribute("stroke-opacity")).toBeTruthy();

    // Pattern circles use fill-opacity.
    const dotCircle = svg.querySelector("pattern circle");
    expect(dotCircle?.getAttribute("fill-opacity")).toBeTruthy();

    // Solid empty layer resolves via --fp-empty for print while preserving hex fallback.
    const emptyPath = [...svg.querySelectorAll("path")].find(
      (path) => path.getAttribute("fill") === DEFAULT_FLOOR_PLAN_THEME.emptyColor
    );
    expect(emptyPath?.style.fill).toBe("var(--fp-empty)");
  });

  it("namespaces pattern ids per canvas instance so two canvases do not collide", () => {
    const first = renderCanvas();
    const second = renderCanvas();

    const firstIds = [...svgOf(first.container).querySelectorAll("defs > pattern")].map(
      (node) => node.id
    );
    const secondIds = [...svgOf(second.container).querySelectorAll("defs > pattern")].map(
      (node) => node.id
    );

    expect(firstIds.length).toBeGreaterThan(0);
    expect(secondIds.length).toBe(firstIds.length);
    for (const id of firstIds) {
      expect(secondIds).not.toContain(id);
    }
  });
});

describe("FloorPlanCanvas — accessibility", () => {
  it("is one image named by the floor summary", () => {
    const { container } = renderCanvas();

    const figure = container.querySelector("figure");
    expect(figure?.getAttribute("role")).toBe("img");
    const label = figure?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Impulse machines");
    expect(label).toContain("Arsenal machines");
    expect(label.length).toBeGreaterThan(20);

    // The summary appears exactly once: not also in the caption or the desc.
    const occurrences = container.innerHTML.split(label).length - 1;
    expect(occurrences).toBe(1);
  });

  it("gives the public map exactly one legend and hides the decorative svg", () => {
    const { container } = renderCanvas({ legendMode: "sr-only" });

    expect(container.querySelectorAll("ul[aria-label]")).toHaveLength(1);
    expect(svgOf(container).getAttribute("aria-hidden")).toBe("true");
  });

  it("renders no legend when the caller owns it", () => {
    const { container } = renderCanvas({ legendMode: "none" });
    expect(container.querySelectorAll("ul[aria-label]")).toHaveLength(0);
  });

  it("keeps one tab stop and a focus ring drawn inside the viewBox", () => {
    const { container } = renderCanvas({ interactive: true, focusRow: 1, focusCol: 2 });
    const svg = svgOf(container);

    // Exactly one focusable node: the svg itself, reachable via Tab.
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(svg.getAttribute("aria-hidden")).toBeNull();

    // The visible cursor is a two-tone ring in user units at the roving square,
    // since no per-square DOM node exists to carry :focus-visible. Two tones so
    // it cannot vanish on a square of the same colour as the ring.
    const ring = svg.querySelector("g[data-focus-ring]");
    expect(ring).not.toBeNull();
    expect(ring?.querySelectorAll("rect")).toHaveLength(2);

    const inner = svg.querySelector("rect[data-focus-ring-inner]");
    expect(Number(inner?.getAttribute("x"))).toBeGreaterThanOrEqual(2);
    expect(Number(inner?.getAttribute("x"))).toBeLessThan(3);
    expect(Number(inner?.getAttribute("y"))).toBeGreaterThanOrEqual(1);
    expect(Number(inner?.getAttribute("y"))).toBeLessThan(2);
    // 3px / 1.5px regardless of grid size.
    expect(inner?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    expect(svg.querySelector("rect[data-focus-ring-outer]")).not.toBeNull();
  });

  it("announces the cursor square through ONE live region, derived on demand", () => {
    const { container, rerender } = renderCanvas({
      interactive: true,
      focusRow: 1,
      focusCol: 2,
    });

    // Exactly one live region, and it names the square under the cursor.
    const live = container.querySelectorAll("[aria-live='polite']");
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toContain("Row 2");
    expect(live[0].textContent).toContain("column 3");

    // Moving the cursor re-derives the string for the NEW square only.
    rerender(
      <FloorPlanCanvas
        plan={buildPlan()}
        floorId="floor-1"
        theme={DEFAULT_FLOOR_PLAN_THEME}
        labels={DEFAULT_FLOOR_PLAN_LABELS}
        legendMode="none"
        interactive
        focusRow={0}
        focusCol={0}
      />
    );
    const moved = container.querySelector("[aria-live='polite']");
    expect(moved?.textContent).toContain("Row 1");
    expect(moved?.textContent).toContain("column 1");
    expect(moved?.textContent).toContain("Impulse machines");
  });

  it("does not emit a live region for the public view", () => {
    const { container } = renderCanvas({ legendMode: "none" });
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(0);
  });

  it("clamps the focus ring onto the grid for a stale cursor", () => {
    const { container } = renderCanvas({ interactive: true, focusRow: 99, focusCol: -5 });
    const ring = svgOf(container).querySelector("rect[data-focus-ring-inner]");

    // Clamped on each axis independently: row 99 -> 2 (the last row), and
    // col -5 -> 0 (the first column), on a 3 × 4 floor.
    expect(Number(ring?.getAttribute("x"))).toBeGreaterThanOrEqual(0);
    expect(Number(ring?.getAttribute("x"))).toBeLessThan(1);
    expect(Number(ring?.getAttribute("y"))).toBeGreaterThanOrEqual(2);
    expect(Number(ring?.getAttribute("y"))).toBeLessThan(3);
  });
});

describe("FloorPlanCanvas — hit testing with one handler", () => {
  it("reports the top-left square at the top-left pixel", () => {
    const onDown = vi.fn();
    const { container } = renderCanvas({ interactive: true, onCellPointerDown: onDown });
    const svg = svgOf(container);
    stubRect(svg, 120, 90); // 4 cols, 3 rows -> 30px squares

    fireEvent.pointerDown(svg, { button: 0, clientX: 0.5, clientY: 0.5, bubbles: true });

    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe(0);
    expect(onDown.mock.calls[0][1]).toBe(0);
  });

  it("reports the bottom-right square at the bottom-right pixel", () => {
    const onDown = vi.fn();
    const { container } = renderCanvas({ interactive: true, onCellPointerDown: onDown });
    const svg = svgOf(container);
    stubRect(svg, 120, 90);

    fireEvent.pointerDown(svg, { button: 0, clientX: 119.5, clientY: 89.5, bubbles: true });

    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe(2);
    expect(onDown.mock.calls[0][1]).toBe(3);
  });

  it("maps an interior point to the square it falls in", () => {
    const onDown = vi.fn();
    const { container } = renderCanvas({ interactive: true, onCellPointerDown: onDown });
    const svg = svgOf(container);
    stubRect(svg, 120, 90);

    // 30px squares: x=65 -> col 2, y=35 -> row 1.
    fireEvent.pointerDown(svg, { button: 0, clientX: 65, clientY: 35, bubbles: true });

    expect(onDown.mock.calls[0][0]).toBe(1);
    expect(onDown.mock.calls[0][1]).toBe(2);
  });

  it("does not report a square for a press outside the grid", () => {
    const onDown = vi.fn();
    const { container } = renderCanvas({ interactive: true, onCellPointerDown: onDown });
    const svg = svgOf(container);
    stubRect(svg, 120, 90, 100, 50);

    // Above the grid.
    fireEvent.pointerDown(svg, { button: 0, clientX: 120, clientY: 40, bubbles: true });
    // Right of the grid.
    fireEvent.pointerDown(svg, { button: 0, clientX: 260, clientY: 60, bubbles: true });

    expect(onDown).not.toHaveBeenCalled();
  });

  it("reports drag movement through the same single listener", () => {
    const onMove = vi.fn();
    const { container } = renderCanvas({ interactive: true, onCellPointerMove: onMove });
    const svg = svgOf(container);
    stubRect(svg, 120, 90);

    fireEvent.pointerMove(svg, { clientX: 15, clientY: 15, bubbles: true });
    fireEvent.pointerMove(svg, { clientX: 105, clientY: 75, bubbles: true });

    expect(onMove).toHaveBeenCalledTimes(2);
    expect([onMove.mock.calls[0][0], onMove.mock.calls[0][1]]).toEqual([0, 0]);
    expect([onMove.mock.calls[1][0], onMove.mock.calls[1][1]]).toEqual([2, 3]);
  });

  it("stays inert for the public view", () => {
    const onDown = vi.fn();
    const onMove = vi.fn();
    const { container } = renderCanvas({ onCellPointerDown: onDown, onCellPointerMove: onMove });
    const svg = svgOf(container);
    stubRect(svg, 120, 90);

    fireEvent.pointerDown(svg, { button: 0, clientX: 15, clientY: 15, bubbles: true });
    fireEvent.pointerMove(svg, { clientX: 15, clientY: 15, bubbles: true });

    expect(onDown).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("FloorPlanCanvas — label threshold follows the measured width", () => {
  it("drops labels below 16px per cell and restores them when widened via ResizeObserver", () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    let resizeCallback: ResizeObserverCallback | null = null;

    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    try {
      const { container } = renderCanvas();
      const svg = svgOf(container);
      // Seeded width (720px / 4 cols = 180px/cell) shows labels initially.
      expect(svg.querySelectorAll("pattern text").length).toBeGreaterThan(0);

      // Narrow to 48px across 4 cols (12px/cell < 16px threshold): labels drop.
      act(() => {
        resizeCallback?.(
          [{ contentRect: { width: 48 } } as ResizeObserverEntry],
          {} as ResizeObserver
        );
      });
      expect(svg.querySelectorAll("pattern text")).toHaveLength(0);

      // Widen to 200px across 4 cols (50px/cell >= 16px threshold): labels return.
      act(() => {
        resizeCallback?.(
          [{ contentRect: { width: 200 } } as ResizeObserverEntry],
          {} as ResizeObserver
        );
      });
      expect(svg.querySelectorAll("pattern text").length).toBeGreaterThan(0);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it("keeps one path per appearance after a re-measure", () => {
    const { container } = renderCanvas();
    const svg = svgOf(container);
    const before = svg.querySelectorAll("path").length;
    stubRect(svg, 1600, 1200);
    fireEvent(window, new Event("resize"));
    expect(svgOf(container).querySelectorAll("path").length).toBe(before);
  });
});

describe("FloorPlanCanvas — stroke preview", () => {
  it("draws the in-progress drag as ONE merged path", () => {
    const { container } = renderCanvas({
      interactive: true,
      strokePreview: {
        keys: new Set(["0:0", "0:1", "0:2"]),
        style: { backgroundColor: "#2563EB" },
        label: "IM",
      },
    });

    const preview = svgOf(container).querySelector("path[data-stroke-preview]");
    expect(preview).not.toBeNull();
    // One run for three adjacent squares.
    expect(preview?.getAttribute("d")).toBe("M0 0h3v1h-3z");
    expect(preview?.getAttribute("pointer-events")).toBe("none");
  });

  it("draws nothing when the preview is empty", () => {
    const { container } = renderCanvas({
      interactive: true,
      strokePreview: { keys: new Set(), style: {}, label: "" },
    });
    expect(svgOf(container).querySelector("path[data-stroke-preview]")).toBeNull();
  });
});
