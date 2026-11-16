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
  type RenderedCell,
} from "@/modules/gym-floor-plan";
import {
  CELL_BASE_STYLE,
  CELL_LABEL_FONT_SIZE,
  cellKey,
  cellStyle,
  clampToAxis,
  FLOOR_PLAN_THEME_CSS_VARIABLES,
  gridContainerStyle,
  themeVariablesStyle,
} from "@/components/floor-plan/cellStyle";

function renderedCell(patch: Partial<RenderedCell> = {}): RenderedCell {
  return {
    row: 0,
    col: 0,
    kind: "machine",
    color: "#2563EB",
    inkColor: "#FFFFFF",
    pattern: "solid",
    shortLabel: "IM",
    ariaLabel: "σειρά 1, στήλη 1, εξοπλισμός",
    tooltip: "εξοπλισμός",
    ...patch,
  } as RenderedCell;
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
    const style = cellStyle(renderedCell());

    expect(style.backgroundColor).toBe("#2563EB");
    expect(style.color).toBe("#FFFFFF");
    expect(style.minWidth).toBe(0);
    expect(style.display).toBe("flex");
    expect(style.fontSize).toBe(CELL_LABEL_FONT_SIZE);
  });

  it("paints empty and void squares with theme variables so print can restyle them", () => {
    // The owner's colour is irrelevant for these kinds: the theme wins.
    const empty = cellStyle(renderedCell({ kind: "empty", color: "#123456" }));
    const voidCell = cellStyle(renderedCell({ kind: "void", color: "#123456" }));

    expect(empty.backgroundColor).toBe("var(--fp-empty)");
    expect(empty.color).toBe("var(--fp-ink)");
    expect(voidCell.backgroundColor).toBe("var(--fp-void)");
    expect(voidCell.color).toBe("var(--fp-ink)");
  });

  it("draws the pattern with the cell's ink colour, not the theme's", () => {
    const cell = renderedCell({ pattern: "diagonal" });
    const style = cellStyle(cell);
    const expected = patternToBackground("diagonal", cell.inkColor);

    expect(style.backgroundImage).toBe(expected.backgroundImage);
    expect(style.backgroundSize).toBe(expected.backgroundSize);
  });

  it("omits backgroundSize for a pattern that has none", () => {
    // A solid pattern returns no size; the key must be absent, not undefined,
    // so React does not emit `background-size: undefined`.
    const solid = cellStyle(renderedCell({ pattern: "solid" }));
    expect("backgroundSize" in solid).toBe(
      patternToBackground("solid", "#FFF").backgroundSize !== undefined
    );
  });

  it("keeps the shared cell geometry on every kind", () => {
    for (const kind of ["empty", "void", "machine"] as const) {
      const style = cellStyle(renderedCell({ kind }));
      for (const [key, value] of Object.entries(CELL_BASE_STYLE)) {
        expect(style[key as keyof typeof style]).toEqual(value);
      }
    }
  });
});

describe("gridContainerStyle", () => {
  it("forwards the module's grid template and keeps a 1px hairline gap", () => {
    const style = gridContainerStyle({
      gridTemplateColumns: "repeat(3, 1fr)",
      gridTemplateRows: "repeat(2, 1fr)",
      aspectRatio: "3 / 2",
    });

    expect(style.display).toBe("grid");
    expect(style.gridTemplateColumns).toBe("repeat(3, 1fr)");
    expect(style.gridTemplateRows).toBe("repeat(2, 1fr)");
    expect(style.aspectRatio).toBe("3 / 2");
    expect(style.width).toBe("100%");
    expect(style.gap).toBe(1);
    expect(style.backgroundColor).toBe("var(--fp-grid-line)");
    expect(style.border).toBe("1px solid var(--fp-grid-line)");
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
