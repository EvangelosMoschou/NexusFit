/**
 * Characterization tests for the floor-plan copy module.
 *
 * Before this file, `labels.ts` was untested: the Greek copy, the pattern
 * ordering and the palette were only ever exercised through a full jsdom
 * render. That made the count-noun declension (which lived inline at four call
 * sites) impossible to pin down; it is now `squareNoun`/`formatSquareCount`
 * and covered here directly.
 */

import { describe, expect, it } from "vitest";
import { CELL_PATTERNS } from "@/modules/gym-floor-plan";
import {
  FLOOR_PLAN_CATEGORY_PALETTE,
  FLOOR_PLAN_PATTERN_LABELS,
  FLOOR_PLAN_PATTERN_OPTIONS,
  GREEK_FLOOR_PLAN_LABELS,
  formatSquareCount,
  squareNoun,
} from "@/components/floor-plan/labels";

describe("GREEK_FLOOR_PLAN_LABELS", () => {
  it("overrides every label the module ships an English default for", () => {
    // A missing key would silently fall back to English in the UI.
    for (const value of Object.values(GREEK_FLOOR_PLAN_LABELS)) {
      expect(value).not.toMatch(/^[a-z ]+$/);
    }
  });

  it("keeps the module's English frame out of the Greek copy", () => {
    expect(GREEK_FLOOR_PLAN_LABELS.unavailable).toBe("μη διαθέσιμο");
    expect(GREEK_FLOOR_PLAN_LABELS.openFloor).toBe("ελεύθερος χώρος");
    expect(GREEK_FLOOR_PLAN_LABELS.equipment).toBe("εξοπλισμός");
    expect(GREEK_FLOOR_PLAN_LABELS.row).toBe("Σειρά");
    expect(GREEK_FLOOR_PLAN_LABELS.column).toBe("στήλη");
    expect(GREEK_FLOOR_PLAN_LABELS.noEquipment).toBe("χωρίς εξοπλισμό");
    expect(GREEK_FLOOR_PLAN_LABELS.unknownCategory).toBe("άγνωστη κατηγορία");
  });
});

describe("pattern labels", () => {
  it("labels every cell pattern the module defines", () => {
    expect(Object.keys(FLOOR_PLAN_PATTERN_LABELS).sort()).toEqual([...CELL_PATTERNS].sort());
  });

  it("offers one option per pattern, in the module's display order", () => {
    expect(FLOOR_PLAN_PATTERN_OPTIONS.map((option) => option.value)).toEqual([...CELL_PATTERNS]);
  });

  it("gives every option a Greek label matching the label map", () => {
    for (const option of FLOOR_PLAN_PATTERN_OPTIONS) {
      expect(option.label).toBe(FLOOR_PLAN_PATTERN_LABELS[option.value]);
    }
  });
});

describe("FLOOR_PLAN_CATEGORY_PALETTE", () => {
  it("is a list of unique upper-case #RRGGBB colours with Greek names", () => {
    const colors = FLOOR_PLAN_CATEGORY_PALETTE.map((swatch) => swatch.color);

    for (const color of colors) expect(color).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(colors).size).toBe(colors.length);
    for (const swatch of FLOOR_PLAN_CATEGORY_PALETTE) expect(swatch.name).toBeTruthy();
  });

  it("starts with the blue the category form pre-selects", () => {
    // `CategoryPanel` seeds a new draft from entry 0 and treats it as the
    // fallback when every palette colour is taken; reordering is a UI change.
    expect(FLOOR_PLAN_CATEGORY_PALETTE[0].color).toBe("#2563EB");
  });
});

describe("squareNoun", () => {
  it("declines the Greek noun for one square and for many", () => {
    expect(squareNoun(0)).toBe("τετράγωνα");
    expect(squareNoun(1)).toBe("τετράγωνο");
    expect(squareNoun(2)).toBe("τετράγωνα");
    expect(squareNoun(11)).toBe("τετράγωνα");
    expect(squareNoun(100)).toBe("τετράγωνα");
  });

  it("declines the genitive the delete dialog's confirm label needs", () => {
    expect(squareNoun(1, "genitive")).toBe("τετραγώνου");
    expect(squareNoun(0, "genitive")).toBe("τετραγώνων");
    expect(squareNoun(7, "genitive")).toBe("τετραγώνων");
  });
});

describe("formatSquareCount", () => {
  it("joins the count and its declined noun with one space", () => {
    expect(formatSquareCount(0)).toBe("0 τετράγωνα");
    expect(formatSquareCount(1)).toBe("1 τετράγωνο");
    expect(formatSquareCount(12)).toBe("12 τετράγωνα");
  });

  it("supports the genitive form used in `Καθαρισμός 1 τετραγώνου`", () => {
    expect(formatSquareCount(1, "genitive")).toBe("1 τετραγώνου");
    expect(formatSquareCount(3, "genitive")).toBe("3 τετραγώνων");
  });
});
