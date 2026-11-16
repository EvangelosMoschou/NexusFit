import { describe, expect, it } from "vitest";
import { DEFAULT_FLOOR_PLAN_THEME, PRINT_FLOOR_PLAN_THEME } from "@/modules/gym-floor-plan";
import {
  cssColorToHex,
  FLOOR_PLAN_THEME_VARIABLES,
  readFloorPlanThemeSignature,
  resolveFloorPlanTheme,
} from "@/components/floor-plan/theme";
import { themeFromSignature } from "@/components/floor-plan/useFloorPlanTheme";

describe("cssColorToHex", () => {
  it("converts the app's space-separated RGB triplets", () => {
    expect(cssColorToHex("33 36 45")).toBe("#21242D");
    expect(cssColorToHex("  255   255  255  ")).toBe("#FFFFFF");
  });

  it("accepts comma-separated channels", () => {
    expect(cssColorToHex("56, 189, 248")).toBe("#38BDF8");
  });

  it("passes through hex in 3- and 6-digit form", () => {
    expect(cssColorToHex("#21242d")).toBe("#21242D");
    expect(cssColorToHex("#abc")).toBe("#AABBCC");
  });

  it("rejects values it cannot resolve", () => {
    expect(cssColorToHex("")).toBeNull();
    expect(cssColorToHex(null)).toBeNull();
    expect(cssColorToHex(undefined)).toBeNull();
    expect(cssColorToHex("rgb(1,2,3)")).toBeNull();
    expect(cssColorToHex("33 36")).toBeNull();
    expect(cssColorToHex("300 0 0")).toBeNull();
    expect(cssColorToHex("not a colour")).toBeNull();
  });
});

describe("resolveFloorPlanTheme", () => {
  it("maps every palette variable to its theme field", () => {
    const values: Record<string, string> = {
      "--surface-rgb": "33 36 45",
      "--bg-rgb": "24 26 32",
      "--border-rgb": "59 65 81",
      "--muted-rgb": "165 173 193",
      "--ink-rgb": "243 244 246",
    };

    const theme = resolveFloorPlanTheme((name) => values[name] ?? "");

    expect(theme.surfaceColor).toBe("#21242D");
    expect(theme.emptyColor).toBe("#181A20");
    expect(theme.gridLineColor).toBe("#3B4151");
    expect(theme.inkColor).toBe("#F3F4F6");
    // void and muted ink both borrow --muted-rgb; the palette has no dedicated
    // token for either.
    expect(theme.voidColor).toBe("#A5ADC1");
    expect(theme.mutedInkColor).toBe("#A5ADC1");
  });

  it("falls back field by field so a half-themed page still renders", () => {
    const theme = resolveFloorPlanTheme((name) => (name === "--ink-rgb" ? "10 10 10" : ""));

    expect(theme.inkColor).toBe("#0A0A0A");
    expect(theme.surfaceColor).toBe(DEFAULT_FLOOR_PLAN_THEME.surfaceColor);
    expect(theme.voidColor).toBe(DEFAULT_FLOOR_PLAN_THEME.voidColor);
  });

  it("returns the print theme's own values when given as the fallback", () => {
    const theme = resolveFloorPlanTheme(() => "", PRINT_FLOOR_PLAN_THEME);
    expect(theme).toEqual(PRINT_FLOOR_PLAN_THEME);
  });

  it("declares one variable per theme field", () => {
    const fields = FLOOR_PLAN_THEME_VARIABLES.map(([field]) => field).sort();
    expect(fields).toEqual(Object.keys(DEFAULT_FLOOR_PLAN_THEME).sort());
  });
});

describe("themeFromSignature", () => {
  it("parses the joined signature back into a theme", () => {
    const signature = [
      "33 36 45",
      "24 26 32",
      "59 65 81",
      "165 173 193",
      "243 244 246",
      "165 173 193",
    ].join("|");
    const theme = themeFromSignature(signature);

    expect(theme.surfaceColor).toBe("#21242D");
    expect(theme.emptyColor).toBe("#181A20");
    expect(theme.inkColor).toBe("#F3F4F6");
  });

  it("returns the fallback for an empty or misshapen signature", () => {
    expect(themeFromSignature("")).toEqual(DEFAULT_FLOOR_PLAN_THEME);
    expect(themeFromSignature("a|b")).toEqual(DEFAULT_FLOOR_PLAN_THEME);
  });
});

describe("readFloorPlanThemeSignature", () => {
  it("returns the empty server snapshot when there is no DOM", () => {
    // The test environment is `node`, so there is no `window`/`document`; the
    // empty string is what makes the hook render the default theme on the server.
    expect(readFloorPlanThemeSignature()).toBe("");
  });
});
