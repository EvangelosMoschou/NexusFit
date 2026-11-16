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
  it("renders a legend and one cell per square for a small plan", async () => {
    const plan = buildPlan();
    mockFetchOnce({ success: true, plan, updatedAt: "2026-01-01T00:00:00Z" });

    const { container } = render(<GymFloorPlan />);

    // 2 rows × 3 cols = 6 cells.
    await waitFor(() => expect(container.querySelectorAll("[data-row]")).toHaveLength(6));

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

  it("shows the short labels inside the painted squares", async () => {
    const plan = buildPlan();
    mockFetchOnce({ success: true, plan });

    const { container } = render(<GymFloorPlan />);
    await waitFor(() => expect(container.querySelectorAll("[data-row]")).toHaveLength(6));

    const labels = [...container.querySelectorAll("[data-row]")].map((node) =>
      node.textContent?.trim()
    );
    expect(labels.filter((label) => label === "IM")).toHaveLength(1);
    expect(labels.filter((label) => label === "AR")).toHaveLength(1);
    expect(labels.filter((label) => label === "×")).toHaveLength(1);
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
    expect(container.querySelectorAll("[data-row]")).toHaveLength(6);

    screen.getByRole("tab", { name: "First floor" }).click();

    await waitFor(() => expect(container.querySelectorAll("[data-row]")).toHaveLength(1));
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
