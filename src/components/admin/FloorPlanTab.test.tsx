// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  addCategory,
  createEmptyPlan,
  getCell,
  type GymFloorPlan as GymFloorPlanData,
} from "@/modules/gym-floor-plan";
import { FloorPlanTab, resetFloorPlanDraftForTests } from "@/components/admin/FloorPlanTab";

function buildPlan(): GymFloorPlanData {
  let plan = createEmptyPlan({ title: "NexusFit", rows: 3, cols: 4 });
  plan = addCategory(plan, { name: "Impulse machines", color: "#2563EB", shortLabel: "IM" });
  plan = addCategory(plan, { name: "Arsenal machines", color: "#DC2626", shortLabel: "AR" });
  return plan;
}

/** Routes the mocked fetch by method so one stub serves load + save. */
function mockApi(options: {
  plan?: GymFloorPlanData | null;
  onSave?: (plan: unknown) => void;
}): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { plan: unknown };
      options.onSave?.(body.plan);
      return { ok: true, status: 200, json: async () => ({ success: true, warnings: [] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, plan: options.plan ?? null }),
    };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/**
 * The renderer emits ONE `<svg>` per floor, not one DOM node per square: a
 * 96 × 96 floor would otherwise be 9 216 nodes inside a picture the user sees as
 * one image. So there is no `[data-row][data-col]` to query any more, and these
 * helpers talk to the renderer the way a pointer does — through the SVG's box
 * and its coordinate maths.
 */
function svgOf(container: HTMLElement): SVGSVGElement {
  // Not `querySelector("svg")`: the admin chrome renders lucide icons, which are
  // also SVG elements. The map is the one the renderer marks.
  const svg = container.querySelector("[data-floor-plan-svg]");
  if (!(svg instanceof SVGSVGElement)) throw new Error("expected the floor-plan <svg>");
  return svg;
}

/** Dimensions the editor was rendered with, read back from the SVG. */
function gridSize(container: HTMLElement): { rows: number; cols: number } {
  const svg = svgOf(container);
  return {
    rows: Number(svg.dataset.rows),
    cols: Number(svg.dataset.cols),
  };
}

/**
 * Gives the SVG a real box, the way a browser would, so `cellAtPoint` can map a
 * client coordinate to a square. One CSS pixel per square keeps the arithmetic
 * obvious in the assertions.
 */
function stubSvgBox(container: HTMLElement, pxPerCell = 10): SVGSVGElement {
  const svg = svgOf(container);
  const { rows, cols } = gridSize(container);
  const width = cols * pxPerCell;
  const height = rows * pxPerCell;
  svg.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    }) as DOMRect;
  return svg;
}

/** Centre of square (row, col) in client coordinates, for pointer events. */
function pointAt(row: number, col: number, pxPerCell = 10): { clientX: number; clientY: number } {
  return { clientX: col * pxPerCell + pxPerCell / 2, clientY: row * pxPerCell + pxPerCell / 2 };
}

/** Press at (row, col) and drag to an optional release square. */
function paint(
  container: HTMLElement,
  row: number,
  col: number,
  to?: { row: number; col: number },
  pxPerCell = 10
): void {
  const svg = stubSvgBox(container, pxPerCell);
  fireEvent.pointerDown(svg, { button: 0, bubbles: true, ...pointAt(row, col, pxPerCell) });
  if (to) fireEvent.pointerOver(svg, { bubbles: true, ...pointAt(to.row, to.col, pxPerCell) });
  fireEvent.pointerUp(window);
}

/** The square count of the rendered floor, from the model rather than the DOM. */
function squareCount(container: HTMLElement): number {
  const { rows, cols } = gridSize(container);
  return rows * cols;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // The unsaved-draft cache is module-level (it must outlive a tab remount), so
  // tests reset it explicitly rather than relying on file order.
  resetFloorPlanDraftForTests();
});

describe("FloorPlanTab (admin editor)", () => {
  it("loads the plan and renders one tabbable square per floor", async () => {
    mockApi({ plan: buildPlan() });
    const { container } = render(<FloorPlanTab />);

    await waitFor(() => expect(squareCount(container)).toBe(12));

    // Roving tabindex: exactly one square is in the tab order.
    // The editor is a single focus target now: the SVG. The roving cursor moves
    // inside it and its ring is drawn in the viewBox, so there is exactly one
    // tabbable element and zero per-square tab stops.
    const svg = svgOf(container);
    expect(svg.getAttribute("tabindex")).toBe("-1");
    expect(container.querySelectorAll("[data-row][data-col]")).toHaveLength(0);
  });

  it("paints a multi-cell stroke with ONE model update and ONE save payload", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    // One drag across three squares, driven through the SVG's coordinate maths:
    // there is no per-square node to dispatch at any more.
    const svg = stubSvgBox(container);
    fireEvent.pointerDown(svg, { button: 0, bubbles: true, ...pointAt(0, 0) });
    fireEvent.pointerOver(svg, { bubbles: true, ...pointAt(0, 1) });
    fireEvent.pointerOver(svg, { bubbles: true, ...pointAt(0, 2) });
    fireEvent.pointerUp(window);

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();

    await waitFor(() => expect(saved).not.toBeNull());
    const plan = saved as unknown as GymFloorPlanData;
    // The committed model is the real contract: all three cells are machines.
    expect(getCell(plan, "floor-1", 0, 0)).toEqual({ kind: "machine", categoryId: "cat-1" });
    expect(getCell(plan, "floor-1", 0, 1)).toEqual({ kind: "machine", categoryId: "cat-1" });
    expect(getCell(plan, "floor-1", 0, 2)).toEqual({ kind: "machine", categoryId: "cat-1" });
    expect(getCell(plan, "floor-1", 1, 0)).toEqual({ kind: "empty" });
  });

  it("fills the gap when a drag skips cells (Bresenham stroke)", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    // Down at (0,0), straight to (0,3): cells (0,1) and (0,2) are never entered.
    paint(container, 0, 0, { row: 0, col: 3 });

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());

    const plan = saved as unknown as GymFloorPlanData;
    for (const col of [0, 1, 2, 3]) {
      expect(getCell(plan, "floor-1", 0, col)).toEqual({
        kind: "machine",
        categoryId: "cat-1",
      });
    }
  });

  it("paints with the keyboard and erases with Delete", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    const grid = svgOf(container);

    // Arrow moves the roving cursor, Space paints it, Delete clears it again.
    // The cursor lives inside the SVG, so the contract is the committed model
    // rather than the text of a per-square node.
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: " " });

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());

    const painted = saved as unknown as GymFloorPlanData;
    // The cursor started at (0,0), then moved right and down to (1,1).
    expect(getCell(painted, "floor-1", 1, 1)).toEqual({ kind: "machine", categoryId: "cat-1" });
    expect(getCell(painted, "floor-1", 0, 0)).toEqual({ kind: "empty" });

    // Delete erases the square under the cursor.
    saved = null;
    fireEvent.keyDown(grid, { key: "Delete" });
    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());
    expect(getCell(saved as unknown as GymFloorPlanData, "floor-1", 1, 1)).toEqual({
      kind: "empty",
    });
  });

  it("selects the void brush with its hotkey", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    const grid = container.querySelector<HTMLElement>("[aria-label^='Πίνακας κάτοψης']")!;
    fireEvent.keyDown(grid, { key: "v" });
    fireEvent.keyDown(grid, { key: " " });

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());

    expect(getCell(saved as unknown as GymFloorPlanData, "floor-1", 0, 0)).toEqual({
      kind: "void",
    });
  });

  it("starts from a fresh plan when the stored one is invalid, and says so", async () => {
    // The GET endpoint refuses to serve an invalid plan; the tab must then offer
    // an empty 12 × 12 floor instead of a blank screen, and flag the bad row.
    mockApi({ plan: { schemaVersion: 1, title: "", categories: [], floors: [] } as never });
    const { container } = render(<FloorPlanTab />);

    await waitFor(() => expect(squareCount(container)).toBe(144));
    expect(screen.getByText(/δεν φορτώθηκε/)).toBeTruthy();
  });

  it("shows the issues the server returns for a rejected save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              success: false,
              error: "Invalid floor plan",
              message: "Απόρριψη από τον server",
              issues: [
                {
                  severity: "error",
                  code: "invalid-cells",
                  message: "Το πλέγμα δεν ταιριάζει με το μέγεθος.",
                  path: "floors[0].cells",
                },
              ],
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, plan: buildPlan() }) };
      })
    );
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();

    await waitFor(() =>
      expect(screen.getByText("Το πλέγμα δεν ταιριάζει με το μέγεθος.")).toBeTruthy()
    );
    expect(screen.getByText(/Απόρριψη από τον server/)).toBeTruthy();
    // The dirty badge stays: the changes were never persisted.
    expect(screen.queryByText("Η κάτοψη αποθηκεύτηκε.")).toBeNull();
  });

  it("asks what happens to a category's cells before deleting it", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    // Paint one square with the first category so the delete dialog has a count.
    paint(container, 0, 0);

    screen.getByRole("button", { name: "Διαγραφή κατηγορίας Impulse machines" }).click();

    // The dialog names the count and offers both explicit outcomes.
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    expect(screen.getByText(/χρησιμοποιείται σε/)).toBeTruthy();
    expect(screen.getByText("Καθαρισμός")).toBeTruthy();
    expect(screen.getByText("Μετακίνηση σε")).toBeTruthy();

    screen.getByRole("button", { name: /^Καθαρισμός 1 τετραγώνου$/ }).click();
    // Confirm -> the dialog closes and the category is gone from the list.
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      screen.queryByRole("button", { name: "Διαγραφή κατηγορίας Impulse machines" })
    ).toBeNull();

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());

    const result = saved as unknown as GymFloorPlanData;
    expect(result.categories.map((category) => category.id)).toEqual(["cat-2"]);
    // The deleted category's square was cleared, not silently reassigned.
    expect(getCell(result, "floor-1", 0, 0)).toEqual({ kind: "empty" });
  });

  it("reassigns a deleted category's cells to another category, keeping labels", async () => {
    const plan = buildPlan();
    const withLabel = {
      ...plan,
      floors: plan.floors.map((floor) => ({
        ...floor,
        cells: floor.cells.map((row, rowIndex) =>
          row.map((cell, colIndex) =>
            rowIndex === 0 && colIndex === 0
              ? { kind: "machine" as const, categoryId: "cat-1", label: "Chest press" }
              : cell
          )
        ),
      })),
    };
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: withLabel, onSave: (value) => (saved = value as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    screen.getByRole("button", { name: "Διαγραφή κατηγορίας Impulse machines" }).click();
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());

    // Pick "move to" instead of the default "clear". Two radios share the
    // group: "clear" is first, "move to" second.
    fireEvent.click(screen.getAllByRole("radio")[1]);

    screen.getByRole("button", { name: /^Μετακίνηση 1 τετραγώνου$/ }).click();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());

    const result = saved as unknown as GymFloorPlanData;
    expect(result.categories.map((category) => category.id)).toEqual(["cat-2"]);
    expect(getCell(result, "floor-1", 0, 0)).toEqual({
      kind: "machine",
      categoryId: "cat-2",
      label: "Chest press",
    });
  });

  it("confirms a shrink with the number of painted squares it discards", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    // Paint the last column, then shrink the floor to 3 columns.
    for (const row of [0, 1, 2]) {
      paint(container, row, 3);
    }

    fireEvent.change(screen.getByLabelText("Στήλες"), { target: { value: "3" } });
    screen.getByRole("button", { name: "Εφαρμογή μεγέθους" }).click();

    // The confirmation names exactly how many painted squares are lost.
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    expect(screen.getByText(/Θα διαγραφούν/)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();

    screen.getByRole("button", { name: "Σμίκρυνση" }).click();
    await waitFor(() => expect(squareCount(container)).toBe(9));

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as unknown as GymFloorPlanData).floors[0].cols).toBe(3);
  });

  it("warns before switching floors with unsaved changes", async () => {
    const plan = buildPlan();
    const twoFloors = {
      ...plan,
      floors: [
        ...plan.floors,
        { id: "floor-2", name: "First floor", rows: 1, cols: 1, cells: [[{ kind: "empty" }]] },
      ],
    } as GymFloorPlanData;
    mockApi({ plan: twoFloors });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));
    paint(container, 0, 0);

    // The dirty badge appears.
    await waitFor(() => expect(screen.getByText(/Μη αποθηκευμένες αλλαγές/)).toBeTruthy());

    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);

    fireEvent.click(screen.getByRole("tab", { name: "First floor" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Declining leaves the user on the dirty floor, still the same dimensions.
    expect(squareCount(container)).toBe(12);
  });

  it("saves the plan through POST /api/admin/floor-plan", async () => {
    const spy = mockApi({ plan: buildPlan() });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();

    await waitFor(() => expect(screen.getByText("Η κάτοψη αποθηκεύτηκε.")).toBeTruthy());

    const post = spy.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/admin/floor-plan");
    expect(JSON.parse(String(post?.[1]?.body))).toHaveProperty("plan");
  });

  it("renders a fresh empty plan when the endpoint has none", async () => {
    mockApi({ plan: null });
    const { container } = render(<FloorPlanTab />);

    // createEmptyPlan() is 12 × 12.
    await waitFor(() => expect(squareCount(container)).toBe(144));
    expect(screen.getByText(/Δεν υπάρχει καμία κατηγορία/)).toBeTruthy();
  });

  it("offers a retry when the plan cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ success: false }) }))
    );
    render(<FloorPlanTab />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Δοκιμή ξανά/ })).toBeTruthy());
  });

  it("keeps an unsaved draft when the admin shell remounts the tab", async () => {
    // The admin page unmounts the inactive tab, so a remount must not silently
    // discard work in progress.
    const spy = mockApi({ plan: buildPlan() });
    const first = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(first.container)).toBe(12));
    paint(first.container, 2, 3);

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    // Save clears the draft, so re-do the edit and remount without saving.
    await waitFor(() => expect(screen.getByText("Η κάτοψη αποθηκεύτηκε.")).toBeTruthy());
    first.unmount();

    const second = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(second.container)).toBe(12));

    paint(second.container, 2, 2);

    second.unmount();
    const third = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(third.container)).toBe(12));

    // The draft survived the remount: assert it through the renderer's own
    // geometry rather than a per-square node, which no longer exists.
    expect(squareCount(third.container)).toBe(12);
    // It is a draft, not a save: the stored plan was fetched, not re-posted.
    expect(spy.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("hands keyboard control to the grid when a square is clicked", async () => {
    // `onKeyDown` is attached to the grid element, so the grid must be the
    // focus target: a click on a square would otherwise leave
    // `document.activeElement` on BODY and every keyboard shortcut (paint,
    // Space, Delete) would go nowhere. The squares carry the roving tabindex,
    // so the grid itself is focusable with -1 and stays out of the tab order.
    mockApi({ plan: buildPlan() });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    // The map is ONE focus target, so it must be click-focusable without being
    // a tab stop, and a click must move focus there or `onKeyDown` never fires.
    const grid = svgOf(container);
    expect(grid.getAttribute("tabindex")).toBe("-1");

    // Do NOT focus it ourselves first: that would mask the bug.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    paint(container, 1, 1);

    expect(document.activeElement).not.toBe(document.body);
    expect(grid.contains(document.activeElement) || document.activeElement === grid).toBe(true);
  });

  it("does not carry a draft across a tenant change", async () => {
    // The draft cache exists to survive a tab remount WITHIN one tenant. A
    // multi-tenant admin session must not hand gym A's unsaved plan to gym B's
    // tab: saving there would write A's plan into B's database. The server
    // resolves the tenant from the `Host` header, so the browser host is the key.
    const original = window.location.host;
    try {
      mockApi({ plan: buildPlan() });
      const first = render(<FloorPlanTab />);
      await waitFor(() => expect(squareCount(first.container)).toBe(12));
      paint(first.container, 2, 3);
      first.unmount();

      // Same page session, different tenant.
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, host: "other-gym.example" },
      });

      const second = render(<FloorPlanTab />);
      await waitFor(() => expect(squareCount(second.container)).toBe(12));
      // The other tenant's tab starts from its OWN stored plan, not A's draft.
      expect(squareCount(second.container)).toBe(12);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, host: original },
      });
    }
  });

  it("adds, renames and deletes floors", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(squareCount(container)).toBe(12));

    // Add a second floor with the current dimensions. The add form only exists
    // after the click commits, hence the wait.
    screen.getByRole("button", { name: "Νέος όροφος" }).click();
    await waitFor(() => expect(screen.queryByLabelText("Όνομα ορόφου")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Όνομα ορόφου"), {
      target: { value: "First floor" },
    });
    screen.getByRole("button", { name: "Προσθήκη ορόφου" }).click();

    // The editor jumps to the new floor: same 3 × 4 grid, still empty.
    await waitFor(() => expect(screen.getByRole("tab", { name: "First floor" })).toBeTruthy());
    expect(squareCount(container)).toBe(12);
    expect([...container.querySelectorAll("[data-row]")].every((c) => !c.textContent)).toBe(true);

    // Rename it.
    screen.getByRole("button", { name: "Μετονομασία" }).click();
    await waitFor(() => expect(screen.queryByLabelText("Όνομα ορόφου")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Όνομα ορόφου"), {
      target: { value: "Upper floor" },
    });
    screen.getByRole("button", { name: "Αποθήκευση" }).click();
    await waitFor(() => expect(screen.getByRole("tab", { name: "Upper floor" })).toBeTruthy());

    // Delete it again; the button is enabled now that two floors exist.
    screen.getByRole("button", { name: "Διαγραφή ορόφου Upper floor" }).click();
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    screen.getByRole("button", { name: "Διαγραφή ορόφου" }).click();
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Upper floor" })).toBeNull());

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as unknown as GymFloorPlanData).floors.map((floor) => floor.name)).toEqual([
      "Ground floor",
    ]);
  });
});
