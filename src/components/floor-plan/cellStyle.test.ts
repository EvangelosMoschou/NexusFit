/**
 * Characterization tests for the floor-plan style helpers.
 *
 * These pin the values the shipped components render. The point is not to own
 * Tailwind-shaped CSS forever, but to make the pure mapping testable: before
 * this file, `cellStyle`/`gridContainerStyle`/`themeVariablesStyle` were only
 * exercised indirectly through jsdom component tests.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOOR_PLAN_THEME,
  patternToBackground,
  type CellAppearance,
} from "@/modules/gym-floor-plan";
import {
  CELL_BASE_STYLE,
  CELL_LABEL_FONT_SIZE,
  cellKey,
  cellStyle,
  clampToAxis,
  FLOOR_PLAN_THEME_CSS_VARIABLES,
  strokePreviewFill,
  themeVariablesStyle,
} from "@/components/floor-plan/cellStyle";

function appearance(patch: Partial<CellAppearance> = {}): CellAppearance {
  return {
    kind: "machine",
    categoryId: "cat-1",
    color: "#2563EB",
    inkColor: "#FFFFFF",
    pattern: "solid",
    shortLabel: "IM",
    ...patch,
  };
}

describe("themeVariablesStyle", () => {
  it("maps every theme colour onto its --fp-* custom property", () => {
    const style = themeVariablesStyle(DEFAULT_FLOOR_PLAN_THEME) as Record<string, string>;

    expect(style[FLOOR_PLAN_THEME_CSS_VARIABLES.surface]).toBe(
      DEFAULT_FLOOR_PLAN_THEME.surfaceColor
    );
    expect(style[FLOOR_PLAN_THEME_CSS_VARIABLES.empty]).toBe(DEFAULT_FLOOR_PLAN_THEME.emptyColor);
    expect(style[FLOOR_PLAN_THEME_CSS_VARIABLES.gridLine]).toBe(
      DEFAULT_FLOOR_PLAN_THEME.gridLineColor
    );
    expect(style[FLOOR_PLAN_THEME_CSS_VARIABLES.void]).toBe(DEFAULT_FLOOR_PLAN_THEME.voidColor);
    expect(style[FLOOR_PLAN_THEME_CSS_VARIABLES.ink]).toBe(DEFAULT_FLOOR_PLAN_THEME.inkColor);
    expect(style[FLOOR_PLAN_THEME_CSS_VARIABLES.mutedInk]).toBe(
      DEFAULT_FLOOR_PLAN_THEME.mutedInkColor
    );
  });

  it("exports exactly the six properties the print stylesheet redefines", () => {
    expect(Object.keys(FLOOR_PLAN_THEME_CSS_VARIABLES).sort()).toEqual([
      "empty",
      "gridLine",
      "ink",
      "mutedInk",
      "surface",
      "void",
    ]);
    expect(
      Object.values(FLOOR_PLAN_THEME_CSS_VARIABLES).every((name) => name.startsWith("--fp-"))
    ).toBe(true);
  });
});

describe("cellStyle", () => {
  it("paints a machine square with its category colour and contrast ink", () => {
    const style = cellStyle(appearance());

    expect(style.backgroundColor).toBe("#2563EB");
    expect(style.color).toBe("#FFFFFF");
    expect(style.minWidth).toBe(0);
    expect(style.display).toBe("flex");
    expect(style.fontSize).toBe(CELL_LABEL_FONT_SIZE);
  });

  it("paints empty and void squares with theme variables so print can restyle them", () => {
    // The owner's colour is irrelevant for these kinds: the theme wins.
    const empty = cellStyle(appearance({ kind: "empty", color: "#123456" }));
    const voidCell = cellStyle(appearance({ kind: "void", color: "#123456" }));

    expect(empty.backgroundColor).toBe("var(--fp-empty)");
    expect(empty.color).toBe("var(--fp-ink)");
    expect(voidCell.backgroundColor).toBe("var(--fp-void)");
    expect(voidCell.color).toBe("var(--fp-ink)");
  });

  it("draws the pattern with the cell's ink colour, not the theme's", () => {
    const cell = appearance({ pattern: "diagonal" });
    const style = cellStyle(cell);
    const expected = patternToBackground("diagonal", cell.inkColor);

    expect(style.backgroundImage).toBe(expected.backgroundImage);
    expect(style.backgroundSize).toBe(expected.backgroundSize);
  });

  it("omits backgroundSize for a pattern that has none", () => {
    // A solid pattern returns no size; the key must be absent, not undefined,
    // so React does not emit `background-size: undefined`.
    const solid = cellStyle(appearance({ pattern: "solid" }));
    expect("backgroundSize" in solid).toBe(
      patternToBackground("solid", "#FFF").backgroundSize !== undefined
    );
  });

  it("keeps the shared cell geometry on every kind", () => {
    for (const kind of ["empty", "void", "machine"] as const) {
      const style = cellStyle(appearance({ kind }));
      for (const [key, value] of Object.entries(CELL_BASE_STYLE)) {
        expect(style[key as keyof typeof style]).toEqual(value);
      }
    }
  });
});

describe("strokePreviewFill", () => {
  it("reads the resolved fill back out of the preview style", () => {
    // The SVG paints the live stroke with one path, so the canvas needs a plain
    // fill value rather than a full CSS cell style.
    expect(strokePreviewFill(cellStyle(appearance()))).toBe("#2563EB");
    // Empty and void stay theme-driven, so a print swap still applies.
    expect(strokePreviewFill(cellStyle(appearance({ kind: "empty" })))).toBe("var(--fp-empty)");
    expect(strokePreviewFill(cellStyle(appearance({ kind: "void" })))).toBe("var(--fp-void)");
  });

  it("falls back to transparent rather than emitting an empty fill", () => {
    expect(strokePreviewFill(undefined)).toBe("transparent");
    expect(strokePreviewFill({})).toBe("transparent");
    expect(strokePreviewFill({ backgroundColor: "" })).toBe("transparent");
  });
});

describe("cellKey", () => {
  it("builds the `row:col` key used to deduplicate a stroke", () => {
    expect(cellKey(0, 0)).toBe("0:0");
    expect(cellKey(12, 3)).toBe("12:3");
  });

  it("distinguishes rows from columns, which a naive concat would not", () => {
    expect(cellKey(1, 23)).not.toBe(cellKey(12, 3));
  });
});

describe("clampToAxis", () => {
  it("keeps an in-range coordinate untouched", () => {
    expect(clampToAxis(2, 5)).toBe(2);
    expect(clampToAxis(0, 5)).toBe(0);
    expect(clampToAxis(4, 5)).toBe(4);
  });

  it("clamps above the last index and below zero", () => {
    expect(clampToAxis(9, 5)).toBe(4);
    expect(clampToAxis(-1, 5)).toBe(0);
    expect(clampToAxis(-40, 40)).toBe(0);
  });

  it("collapses every coordinate onto 0 for a single-cell axis", () => {
    expect(clampToAxis(0, 1)).toBe(0);
    expect(clampToAxis(3, 1)).toBe(0);
    expect(clampToAxis(-3, 1)).toBe(0);
  });
});
