// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaultGymConfig } from "@/config/gymConfig";

async function loadTimetable(config: unknown = defaultGymConfig) {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, config }) }))
  );
  const mod = await import("@/components/Timetable");
  return mod.Timetable;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Timetable (the public class schedule)", () => {
  it("opens on Monday and lists only Monday's classes", async () => {
    const Timetable = await loadTimetable();
    const { container } = render(<Timetable onOpenBooking={() => {}} />);

    // The selected day is highlighted with the button variant, so assert the
    // rows rather than the styling.
    await waitFor(() => expect(container.textContent).toContain("Χάθα Γιόγκα"));
    const monday = defaultGymConfig.schedule.filter((item) => item.day === "Monday");
    for (const item of monday) {
      expect(screen.getByText(item.className)).toBeTruthy();
    }
    // A Tuesday class must not be visible while Monday is selected.
    const tuesday = defaultGymConfig.schedule.find((item) => item.day === "Tuesday")!;
    expect(screen.queryByText(tuesday.className)).toBeNull();
  });

  it("switches to another day and shows that day's classes", async () => {
    const Timetable = await loadTimetable();
    render(<Timetable onOpenBooking={() => {}} />);
    await waitFor(() => expect(screen.getByText("Χάθα Γιόγκα")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Τρίτη" }));

    const tuesday = defaultGymConfig.schedule.filter((item) => item.day === "Tuesday");
    for (const item of tuesday) {
      expect(screen.getByText(item.className)).toBeTruthy();
    }
    expect(screen.queryByText("Χάθα Γιόγκα")).toBeNull();
  });

  it("filters the selected day by category and can go back to all", async () => {
    const Timetable = await loadTimetable();
    render(<Timetable onOpenBooking={() => {}} />);
    await waitFor(() => expect(screen.getByText("Χάθα Γιόγκα")).toBeTruthy());

    // Two Monday classes share the Boxing category? No: Yoga, Boxing, Pilates.
    fireEvent.click(screen.getByRole("button", { name: "Πυγμαχία" }));

    expect(screen.getByText("Πυγμαχία & Τεχνική")).toBeTruthy();
    // A class of another category on the same day must be filtered out.
    expect(screen.queryByText("Χάθα Γιόγκα")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Όλα" }));
    expect(screen.getByText("Χάθα Γιόγκα")).toBeTruthy();
  });

  it("builds the category filter from the configured classes only", async () => {
    // A hardcoded category list would offer filters that match nothing.
    const Timetable = await loadTimetable({
      ...defaultGymConfig,
      schedule: [
        {
          id: "sch-x",
          day: "Monday",
          dayGreek: "Δευτέρα",
          time: "10:00 - 11:00",
          className: "Κωπηλασία",
          category: "Cycling",
          trainer: "Α. Α",
          intensity: "Medium",
          duration: "60 λεπτά",
        },
      ],
    });
    render(<Timetable onOpenBooking={() => {}} />);

    await waitFor(() => expect(screen.getByText("Κωπηλασία")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Ποδηλασία" })).toBeTruthy();
    // Categories from the default config that no longer have classes are gone.
    expect(screen.queryByRole("button", { name: "Γιόγκα" })).toBeNull();
  });

  it("shows an empty day honestly instead of the previous day's classes", async () => {
    const Timetable = await loadTimetable({
      ...defaultGymConfig,
      schedule: defaultGymConfig.schedule.filter((item) => item.day === "Monday"),
    });
    const { container } = render(<Timetable onOpenBooking={() => {}} />);
    await waitFor(() => expect(screen.getByText("Χάθα Γιόγκα")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Σάββατο" }));

    for (const item of defaultGymConfig.schedule.filter((item) => item.day === "Monday")) {
      expect(screen.queryByText(item.className)).toBeNull();
    }
    // The empty-state copy must be there, not a blank panel.
    expect(container.textContent).toMatch(/Δεν|δεν υπάρχουν|κενό/i);
  });

  it("shows the trainer and the duration for each class", async () => {
    const Timetable = await loadTimetable();
    render(<Timetable onOpenBooking={() => {}} />);
    await waitFor(() => expect(screen.getByText("Χάθα Γιόγκα")).toBeTruthy());

    const mondayYoga = defaultGymConfig.schedule.find(
      (item) => item.day === "Monday" && item.category === "Yoga"
    )!;
    const row = screen.getByText(mondayYoga.className).closest("div.p-4")!;
    expect(row.textContent).toContain(mondayYoga.trainer);
    expect(row.textContent).toContain(mondayYoga.duration);
    // The machine key is translated for the member.
    expect(row.textContent).toContain("Γιόγκα");
    expect(row.textContent).not.toContain("Yoga");
  });

  it("routes every class row's action to the booking handler", async () => {
    const Timetable = await loadTimetable();
    const onOpenBooking = vi.fn();
    render(<Timetable onOpenBooking={onOpenBooking} />);
    await waitFor(() => expect(screen.getByText("Χάθα Γιόγκα")).toBeTruthy());

    const mondayCount = defaultGymConfig.schedule.filter((item) => item.day === "Monday").length;
    const actions = screen.getAllByRole("button", { name: "Πληροφορίες" });
    // One action per visible class, so a member can act on any of them.
    expect(actions).toHaveLength(mondayCount);

    fireEvent.click(actions[0]);
    expect(onOpenBooking).toHaveBeenCalledTimes(1);
  });
});
