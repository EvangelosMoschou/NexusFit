/**
 * Characterization tests for the floor dimension field logic.
 *
 * `parseDimension` and `dimensionError` used to be private to `FloorPanel`
 * (401 lines, no test of its own), so the accept/reject boundaries for a typed
 * size were only reachable through a full jsdom render, and the two axis nouns
 * were inlined twice each. Behaviour is pinned here exactly as it shipped —
 * including that the message names the axis with its Greek label and quotes the
 * module's own limits rather than a hard-coded range.
 */

import { describe, expect, it } from "vitest";
import { FLOOR_PLAN_LIMITS } from "@/modules/gym-floor-plan";
import { dimensionError, parseDimension } from "@/components/floor-plan/dimensions";

describe("parseDimension", () => {
  it("parses a plain integer string", () => {
    expect(parseDimension("12")).toBe(12);
    expect(parseDimension("1")).toBe(1);
    expect(parseDimension("40")).toBe(40);
  });

  it("parses a leading-integer string the way parseInt does", () => {
    // `Number.parseInt` is the shipped behaviour; "3.9" truncates, it does not
    // round, and trailing junk is ignored.
    expect(parseDimension("3.9")).toBe(3);
    expect(parseDimension("7abc")).toBe(7);
    expect(parseDimension("  8 ")).toBe(8);
  });

  it("returns NaN for text with no leading number", () => {
    expect(parseDimension("")).toBeNaN();
    expect(parseDimension("abc")).toBeNaN();
    expect(parseDimension("  ")).toBeNaN();
  });

  it("accepts a negative number at parse time; range is dimensionError's job", () => {
    expect(parseDimension("-4")).toBe(-4);
  });
});

describe("dimensionError", () => {
  it("returns null for an in-range integer on either axis", () => {
    expect(dimensionError(1, "rows")).toBeNull();
    expect(dimensionError(FLOOR_PLAN_LIMITS.maxRows, "rows")).toBeNull();
    expect(dimensionError(1, "cols")).toBeNull();
    expect(dimensionError(FLOOR_PLAN_LIMITS.maxCols, "cols")).toBeNull();
  });

  it("names the axis with its Greek label and the module's real limits", () => {
    expect(dimensionError(0, "rows")).toBe(
      `Γραμμές: ακέραιος από ${FLOOR_PLAN_LIMITS.minRows} έως ${FLOOR_PLAN_LIMITS.maxRows}.`
    );
    expect(dimensionError(0, "cols")).toBe(
      `Στήλες: ακέραιος από ${FLOOR_PLAN_LIMITS.minCols} έως ${FLOOR_PLAN_LIMITS.maxCols}.`
    );
  });

  it("rejects values below the minimum and above the maximum", () => {
    expect(dimensionError(FLOOR_PLAN_LIMITS.minRows - 1, "rows")).not.toBeNull();
    expect(dimensionError(FLOOR_PLAN_LIMITS.maxRows + 1, "rows")).not.toBeNull();
    expect(dimensionError(-1, "cols")).not.toBeNull();
    expect(dimensionError(999, "cols")).not.toBeNull();
  });

  it("rejects a non-integer even when it is inside the range", () => {
    // parseInt already truncated a typed "3.9", but the function must not trust
    // a caller that hands it a fraction.
    expect(dimensionError(3.5, "rows")).toMatch(/^Γραμμές:/);
    expect(dimensionError(Number.NaN, "rows")).toMatch(/^Γραμμές:/);
    expect(dimensionError(Number.POSITIVE_INFINITY, "cols")).toMatch(/^Στήλες:/);
  });
});
