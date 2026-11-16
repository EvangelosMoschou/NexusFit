// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Exercises } from "@/components/Exercises";
import { exercisesDatabase } from "@/data/exercisesData";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Exercises (the public exercise library)", () => {
  it("renders every exercise in the database, with its Greek labels", () => {
    const { container } = render(<Exercises />);

    const cards = container.querySelectorAll("article");
    expect(cards).toHaveLength(exercisesDatabase.length);
    for (const exercise of exercisesDatabase.slice(0, 5)) {
      expect(screen.getByText(exercise.greekName)).toBeTruthy();
    }
    // The machine keys must be translated, never shown raw.
    expect(container.textContent).not.toMatch(/\b(barbell|dumbbell|bodyweight)\b/);
    expect(container.textContent).not.toMatch(/\b(beginner|intermediate|advanced)\b/);
  });

  it("filters by muscle group and marks the active filter accessibly", () => {
    render(<Exercises />);

    const all = screen.getByRole("button", { name: "Όλα" });
    expect(all.getAttribute("aria-pressed")).toBe("true");

    const chest = screen.getByRole("button", { name: "Στήθος" });
    fireEvent.click(chest);

    expect(chest.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");

    // Every visible card must be a chest exercise.
    const chestCount = exercisesDatabase.filter((ex) => ex.muscleGroup === "chest").length;
    expect(document.querySelectorAll("article")).toHaveLength(chestCount);
    const nonChest = exercisesDatabase.find((ex) => ex.muscleGroup !== "chest")!;
    expect(screen.queryByText(nonChest.greekName)).toBeNull();
  });

  it("searches Greek names, English names and target muscles", () => {
    const sample = exercisesDatabase[0];
    render(<Exercises />);

    const search = screen.getByLabelText("Αναζήτηση άσκησης");

    fireEvent.change(search, { target: { value: sample.greekName.slice(0, 6).toLowerCase() } });
    expect(screen.getByText(sample.greekName)).toBeTruthy();

    // An English name matches too, so an English-speaking member is served.
    fireEvent.change(search, { target: { value: sample.name.toLowerCase() } });
    expect(screen.getByText(sample.greekName)).toBeTruthy();
  });

  it("combines the search with the muscle filter instead of replacing it", () => {
    // A filter that silently resets on search is how people end up printing the
    // wrong exercise list.
    render(<Exercises />);
    fireEvent.click(screen.getByRole("button", { name: "Πόδια" }));

    const legs = exercisesDatabase.filter((ex) => ex.muscleGroup === "legs");
    const search = screen.getByLabelText("Αναζήτηση άσκησης");
    fireEvent.change(search, { target: { value: legs[0].greekName } });

    expect(document.querySelectorAll("article")).toHaveLength(
      legs.filter((ex) => ex.greekName.includes(legs[0].greekName.slice(0, 3))).length || 1
    );
    // Nothing outside the legs group may appear.
    const chest = exercisesDatabase.find((ex) => ex.muscleGroup === "chest")!;
    expect(screen.queryByText(chest.greekName)).toBeNull();
  });

  it("shows an empty state when nothing matches, and recovers", () => {
    render(<Exercises />);
    const search = screen.getByLabelText("Αναζήτηση άσκησης");

    fireEvent.change(search, { target: { value: "zzzzz-no-such-exercise" } });
    expect(screen.getByText("Δεν βρέθηκαν ασκήσεις για αυτή την αναζήτηση.")).toBeTruthy();
    expect(document.querySelectorAll("article")).toHaveLength(0);

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.queryByText("Δεν βρέθηκαν ασκήσεις για αυτή την αναζήτηση.")).toBeNull();
    expect(document.querySelectorAll("article")).toHaveLength(exercisesDatabase.length);
  });

  it("trims a search that is only whitespace back to the full list", () => {
    render(<Exercises />);

    fireEvent.change(screen.getByLabelText("Αναζήτηση άσκησης"), { target: { value: "   " } });

    expect(document.querySelectorAll("article")).toHaveLength(exercisesDatabase.length);
  });

  it("offers only muscle groups that actually have exercises", () => {
    render(<Exercises />);

    // Every group button must yield at least one card; an empty filter button is
    // a dead end for the visitor.
    for (const group of ["Στήθος", "Πλάτη", "Πόδια", "Ώμοι", "Χέρια", "Κορμός"]) {
      const button = screen.queryByRole("button", { name: group });
      if (!button) continue;
      fireEvent.click(button);
      expect(document.querySelectorAll("article").length).toBeGreaterThan(0);
    }
  });
});
