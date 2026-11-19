// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  createEmptyPlan,
  setCell,
  addCategory,
  addFloor,
  type GymFloorPlan as GymFloorPlanData,
} from "@/modules/gym-floor-plan";
import { GymFloorPlan } from "@/components/GymFloorPlan";

/**
 * The SVG renderer draws one path per APPEARANCE, so the plan's squares are no
 * longer individual DOM nodes. These helpers assert against what the map
 * actually is now: one <svg> whose viewBox describes a rows × cols grid, plus
 * one fill path per appearance. The per-square detail (colour, label, aria text)
 * is covered by src/modules/gym-floor-plan/renderSvg.test.ts against the pure
 * scene builder, which is where it belongs.
 */
function floorSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector<SVGSVGElement>("svg[data-floor-plan-svg]");
  if (!svg) throw new Error("expected the SVG renderer");
  return svg;
}

/** Declared grid size, read back from the renderer's own attributes. */
function floorSize(container: HTMLElement): { rows: number; cols: number } {
  const svg = floorSvg(container);
  return { rows: Number(svg.dataset.rows), cols: Number(svg.dataset.cols) };
}

/** Fill values of the appearance paths, in appearance order. */
function floorFills(container: HTMLElement): string[] {
  return [...floorSvg(container).querySelectorAll("path[fill]")]
    .map((path) => path.getAttribute("fill") ?? "")
    .filter((fill) => fill !== "none");
}

/** A 2 × 3 floor: 2 machines, 1 void, 3 empty squares. */
function buildPlan(): GymFloorPlanData {
  let plan = createEmptyPlan({ title: "NexusFit floor plan", rows: 2, cols: 3 });
  plan = addCategory(plan, { name: "Impulse machines", color: "#2563EB", shortLabel: "IM" });
  plan = addCategory(plan, { name: "Arsenal machines", color: "#DC2626", shortLabel: "AR" });
  plan = setCell(plan, "floor-1", 0, 0, { kind: "machine", categoryId: "cat-1" });
  plan = setCell(plan, "floor-1", 0, 1, { kind: "machine", categoryId: "cat-2" });
  plan = setCell(plan, "floor-1", 1, 2, { kind: "void" });
  return plan;
}

function mockFetchOnce(body: unknown, ok = true): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  // jsdom has no MutationObserver loop issue, but the theme hook subscribes on
  // mount; the default stub keeps it from touching an unstyled document.
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GymFloorPlan (public display)", () => {
  it("renders a legend and an svg map sized to the floor for a small plan", async () => {
    const plan = buildPlan();
    mockFetchOnce({ success: true, plan, updatedAt: "2026-01-01T00:00:00Z" });

    const { container } = render(<GymFloorPlan />);

    // 2 rows × 3 cols, declared by the svg itself. The map is ONE node, not six.
    await waitFor(() => expect(floorSize(container)).toEqual({ rows: 2, cols: 3 }));
    expect(floorSvg(container).getAttribute("viewBox")).toBe("0 0 3 2");

    // Visible legend: both categories plus the fixed void entry.
    expect(screen.getByText("Impulse machines")).toBeTruthy();
    expect(screen.getByText("Arsenal machines")).toBeTruthy();
    expect(screen.getAllByText("μη διαθέσιμο").length).toBeGreaterThan(0);

    // The figure is one image with the module's summary as its accessible name.
    const figure = container.querySelector("figure");
    expect(figure?.getAttribute("role")).toBe("img");
    expect(figure?.getAttribute("aria-label")).toContain("Impulse machines");
    expect(figure?.getAttribute("aria-label")).toContain("μη διαθέσιμο");
  });

  it("draws each short label ONCE as a pattern tile, not once per square", async () => {
    const plan = buildPlan();
    mockFetchOnce({ success: true, plan });

    const { container } = render(<GymFloorPlan />);
    await waitFor(() => expect(floorSize(container)).toEqual({ rows: 2, cols: 3 }));

    // Labels are stamped by one <pattern> per appearance, so each short label
    // exists ONCE no matter how many squares use it. Read the expected labels
    // from the plan itself: `addCategory` derives them from the name.
    const labels = [...floorSvg(container).querySelectorAll("pattern text")].map((node) =>
      node.textContent?.trim()
    );
    for (const category of plan.categories) {
      expect(labels.filter((label) => label === category.shortLabel)).toHaveLength(1);
    }
    expect(labels.filter((label) => label === "×")).toHaveLength(1);
    // The filled paths reference those tiles rather than repeating a shape. One
    // filled path per distinct APPEARANCE, not per square: the floor has 6
    // squares but only 4 appearances (two categories, void, and the empty floor),
    // and each is drawn as a single merged path.
    const referenced = floorFills(container).filter((fill) => fill.startsWith("url(#"));
    expect(referenced).toHaveLength(4);
    // Crucially, that count does not grow with the number of squares.
    expect(referenced.length).toBeLessThan(plan.floors[0].rows * plan.floors[0].cols);
  });

  it("renders nothing when the endpoint has no plan", async () => {
    mockFetchOnce({ success: true, plan: null });

    const { container } = render(<GymFloorPlan />);

    // The section disappears entirely once the empty answer arrives.
    await waitFor(() => expect(container.querySelector("#floor-plan")).toBeNull());
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders nothing when the request fails", async () => {
    mockFetchOnce({ success: false, error: "boom" }, false);

    const { container } = render(<GymFloorPlan />);

    await waitFor(() => expect(container.querySelector("#floor-plan")).toBeNull());
  });

  it("renders nothing when the server hands back an invalid plan", async () => {
    mockFetchOnce({ success: true, plan: { schemaVersion: 1, title: "", categories: [] } });

    const { container } = render(<GymFloorPlan />);

    await waitFor(() => expect(container.querySelector("#floor-plan")).toBeNull());
  });

  it("shows floor tabs only when there is more than one floor and switches between them", async () => {
    let plan = buildPlan();
    plan = addFloor(plan, { name: "First floor", rows: 1, cols: 1 });
    mockFetchOnce({ success: true, plan });

    const { container } = render(<GymFloorPlan />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "Ground floor" })).toBeTruthy());

    expect(screen.getByRole("tab", { name: "First floor" })).toBeTruthy();
    expect(floorSize(container)).toEqual({ rows: 2, cols: 3 });

    screen.getByRole("tab", { name: "First floor" }).click();

    // The other floor is 1 × 1.
    await waitFor(() => expect(floorSize(container)).toEqual({ rows: 1, cols: 1 }));
  });

  it("hides the tabs for a single-floor plan", async () => {
    mockFetchOnce({ success: true, plan: buildPlan() });

    render(<GymFloorPlan />);
    await waitFor(() => expect(screen.getByText("Impulse machines")).toBeTruthy());

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("carries the print stylesheet and the plan root marker", async () => {
    mockFetchOnce({ success: true, plan: buildPlan() });

    const { container } = render(<GymFloorPlan />);
    await waitFor(() => expect(container.querySelector("[data-floor-plan-root]")).toBeTruthy());

    const style = container.querySelector("style[data-floor-plan-print]");
    expect(style?.textContent).toContain("@media print");
    expect(style?.textContent).toContain("break-inside: avoid");
    // Print theme, not the screen theme.
    expect(style?.textContent).toContain("#FFFFFF");
  });
});
