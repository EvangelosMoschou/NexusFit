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

function cells(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-row][data-col]")];
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

    await waitFor(() => expect(cells(container)).toHaveLength(12));

    // Roving tabindex: exactly one square is in the tab order.
    const tabbable = cells(container).filter((cell) => cell.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(cells(container).filter((cell) => cell.getAttribute("tabindex") === "-1")).toHaveLength(
      11
    );
  });

  it("paints a multi-cell stroke with ONE model update and ONE save payload", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(cells(container)).toHaveLength(12));

    const at = (row: number, col: number) =>
      container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;

    // One drag across three squares: pointer-down then two pointer-over moves,
    // then pointer-up at the window level (a drag can end outside the grid).
    fireEvent.pointerDown(at(0, 0), { button: 0, bubbles: true });
    fireEvent.pointerOver(at(0, 1), { bubbles: true });
    fireEvent.pointerOver(at(0, 2), { bubbles: true });
    fireEvent.pointerUp(window);

    // The stroke is previewed while dragging, so all three squares already show
    // the brush's short label...
    await waitFor(() => expect(at(0, 2).textContent).toBe("IM"));
    expect(at(0, 0).textContent).toBe("IM");
    expect(at(0, 1).textContent).toBe("IM");
    // ...and the untouched squares keep their own state.
    expect(at(1, 0).textContent).toBe("");

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();

    await waitFor(() => expect(saved).not.toBeNull());
    const plan = saved as unknown as GymFloorPlanData;
    // Read the committed model, not the preview: all three cells are machines.
    expect(getCell(plan, "floor-1", 0, 0)).toEqual({ kind: "machine", categoryId: "cat-1" });
    expect(getCell(plan, "floor-1", 0, 1)).toEqual({ kind: "machine", categoryId: "cat-1" });
    expect(getCell(plan, "floor-1", 0, 2)).toEqual({ kind: "machine", categoryId: "cat-1" });
    expect(getCell(plan, "floor-1", 1, 0)).toEqual({ kind: "empty" });
  });

  it("fills the gap when a drag skips cells (Bresenham stroke)", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(cells(container)).toHaveLength(12));

    const at = (row: number, col: number) =>
      container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;

    // Down at (0,0), straight to (0,3): cells (0,1) and (0,2) are never entered.
    fireEvent.pointerDown(at(0, 0), { button: 0, bubbles: true });
    fireEvent.pointerOver(at(0, 3), { bubbles: true });
    fireEvent.pointerUp(window);

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
    await waitFor(() => expect(cells(container)).toHaveLength(12));

    const grid = container.querySelector<HTMLElement>("[aria-label^='Πίνακας κάτοψης']")!;
    const target = container.querySelector<HTMLElement>('[data-row="1"][data-col="1"]')!;

    // Arrow moves the roving target, Space paints it.
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: " " });
    await waitFor(() => expect(target.textContent).toBe("IM"));

    fireEvent.keyDown(grid, { key: "Delete" });
    await waitFor(() => expect(target.textContent).toBe(""));

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    await waitFor(() => expect(saved).not.toBeNull());

    const plan = saved as unknown as GymFloorPlanData;
    expect(getCell(plan, "floor-1", 0, 0)).toEqual({ kind: "empty" });
    expect(getCell(plan, "floor-1", 1, 1)).toEqual({ kind: "empty" });
  });

  it("selects the void brush with its hotkey", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(cells(container)).toHaveLength(12));

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

    await waitFor(() => expect(cells(container)).toHaveLength(144));
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
    await waitFor(() => expect(cells(container)).toHaveLength(12));

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
    await waitFor(() => expect(cells(container)).toHaveLength(12));

    // Paint one square with the first category so the delete dialog has a count.
    const at = (row: number, col: number) =>
      container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;
    fireEvent.pointerDown(at(0, 0), { button: 0, bubbles: true });
    fireEvent.pointerUp(window);

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
    await waitFor(() => expect(cells(container)).toHaveLength(12));

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
    await waitFor(() => expect(cells(container)).toHaveLength(12));

    // Paint the last column, then shrink the floor to 3 columns.
    const at = (row: number, col: number) =>
      container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;
    for (const row of [0, 1, 2]) {
      fireEvent.pointerDown(at(row, 3), { button: 0, bubbles: true });
      fireEvent.pointerUp(window);
    }

    fireEvent.change(screen.getByLabelText("Στήλες"), { target: { value: "3" } });
    screen.getByRole("button", { name: "Εφαρμογή μεγέθους" }).click();

    // The confirmation names exactly how many painted squares are lost.
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    expect(screen.getByText(/Θα διαγραφούν/)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();

    screen.getByRole("button", { name: "Σμίκρυνση" }).click();
    await waitFor(() => expect(cells(container)).toHaveLength(9));

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
    await waitFor(() => expect(cells(container)).toHaveLength(12));

    const at = (row: number, col: number) =>
      container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;
    fireEvent.pointerDown(at(0, 0), { button: 0, bubbles: true });
    fireEvent.pointerUp(window);

    // The dirty badge appears.
    await waitFor(() => expect(screen.getByText(/Μη αποθηκευμένες αλλαγές/)).toBeTruthy());

    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);

    fireEvent.click(screen.getByRole("tab", { name: "First floor" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Declining leaves the user on the dirty floor.
    expect(container.querySelectorAll("[data-row][data-col]")).toHaveLength(12);
  });

  it("saves the plan through POST /api/admin/floor-plan", async () => {
    const spy = mockApi({ plan: buildPlan() });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(cells(container)).toHaveLength(12));

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
    await waitFor(() => expect(cells(container)).toHaveLength(144));
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
    await waitFor(() =>
      expect(first.container.querySelectorAll("[data-row][data-col]")).toHaveLength(12)
    );

    const at = (row: number, col: number) =>
      first.container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;
    fireEvent.pointerDown(at(2, 3), { button: 0, bubbles: true });
    fireEvent.pointerUp(window);

    screen.getByRole("button", { name: /Αποθήκευση κάτοψης/ }).click();
    // Save clears the draft, so re-do the edit and remount without saving.
    await waitFor(() => expect(screen.getByText("Η κάτοψη αποθηκεύτηκε.")).toBeTruthy());
    first.unmount();

    const second = render(<FloorPlanTab />);
    await waitFor(() =>
      expect(second.container.querySelectorAll("[data-row][data-col]")).toHaveLength(12)
    );

    const remounted = (row: number, col: number) =>
      second.container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;
    fireEvent.pointerDown(remounted(2, 2), { button: 0, bubbles: true });
    fireEvent.pointerUp(window);
    await waitFor(() => expect(remounted(2, 2).textContent).toBe("IM"));

    second.unmount();
    const third = render(<FloorPlanTab />);
    await waitFor(() =>
      expect(third.container.querySelectorAll("[data-row][data-col]")).toHaveLength(12)
    );

    expect(
      third.container.querySelector<HTMLElement>('[data-row="2"][data-col="2"]')?.textContent
    ).toBe("IM");
    // It is a draft, not a save: the stored plan was fetched, not re-posted.
    expect(spy.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("adds, renames and deletes floors", async () => {
    let saved: GymFloorPlanData | null = null;
    mockApi({ plan: buildPlan(), onSave: (plan) => (saved = plan as GymFloorPlanData) });
    const { container } = render(<FloorPlanTab />);
    await waitFor(() => expect(cells(container)).toHaveLength(12));

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
    expect(cells(container)).toHaveLength(12);
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
