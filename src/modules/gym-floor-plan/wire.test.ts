/**
 * Schema v2 wire-format tests.
 *
 * These cover the run-length encoding itself, the v1 -> v2 migration and the
 * malformed-input cases. The behaviour tests for plan/floor/category operations
 * live in `model.test.ts`; here the contract under test is:
 *
 *   serializePlan -> JSON with token rows  ->  parsePlanValue -> FloorCell[][]
 *
 * and that a hand-written v1 record still loads to the exact same plan.
 */

import { describe, expect, it } from "vitest";
import {
  addCategory,
  createEmptyPlan,
  deserializePlan,
  parsePlanValue,
  serializePlan,
  setCell,
  validatePlan,
} from "./model";
import {
  FLOOR_PLAN_SCHEMA_VERSION,
  type Category,
  type FloorCell,
  type GymFloorPlan,
  type ValidationResult,
} from "./types";
import {
  EMPTY_CELL_TOKEN,
  VOID_CELL_TOKEN,
  collapseEmptyAndVoidRuns,
  decodeFloorRows,
  encodeFloorCells,
  migrateV1PlanRecord,
} from "./wire";

const CATEGORIES: Category[] = [
  { id: "cat-1", name: "Impulse", color: "#2563EB", shortLabel: "IM", pattern: "solid" },
  { id: "cat-2", name: "Arsenal", color: "#DC2626", shortLabel: "AR", pattern: "diagonal" },
];

const EMPTY: FloorCell = { kind: "empty" };
const VOID: FloorCell = { kind: "void" };
const MACHINE: FloorCell = { kind: "machine", categoryId: "cat-1" };
const MACHINE_LABELLED: FloorCell = { kind: "machine", categoryId: "cat-1", label: "Chest press" };
const MACHINE_SECOND: FloorCell = { kind: "machine", categoryId: "cat-2" };

function makePlan(cells: FloorCell[][]): GymFloorPlan {
  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    title: "Wire format",
    categories: CATEGORIES.map((category) => ({ ...category })),
    floors: [
      {
        id: "floor-1",
        name: "Ground floor",
        rows: cells.length,
        cols: cells[0]?.length ?? 0,
        cells,
      },
    ],
  };
}

/** Serializes then parses, asserting success and returning the decoded grid. */
function roundTrip(cells: FloorCell[][]): FloorCell[][] {
  const plan = makePlan(cells);
  const result = deserializePlan(serializePlan(plan));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`round-trip failed: ${JSON.stringify(result.issues)}`);
  expect(result.plan).toEqual(plan);
  return result.plan.floors[0].cells;
}

/** The encoded token row of a single-row grid, for exact token assertions. */
function wireRow(row: FloorCell[]): unknown {
  const parsed = JSON.parse(serializePlan(makePlan([row]))) as {
    floors: Array<{ cells: unknown[] }>;
  };
  return parsed.floors[0].cells[0];
}

function serialized(plan: GymFloorPlan): string {
  return serializePlan(plan);
}

/** Encodes a row through the module's own encoder (no hand-written tokens). */
function encodeRow(row: FloorCell[]): unknown {
  const index = new Map(CATEGORIES.map((category, position) => [category.id, position]));
  return encodeFloorCells([row], index)[0];
}

function decodeResult(rawRows: unknown[], cols: number): ReturnType<typeof decodeFloorRows> {
  return decodeFloorRows(
    rawRows,
    cols,
    CATEGORIES.map((category) => category.id),
    "floors[0].cells"
  );
}

// ---------------------------------------------------------------------------
// Wire format shape
// ---------------------------------------------------------------------------

describe("schema v2 wire format", () => {
  it("reports the current schema version and keeps the human-readable fields", () => {
    const plan = makePlan([[EMPTY, VOID, MACHINE]]);
    const parsed = JSON.parse(serialized(plan)) as Record<string, unknown> & {
      floors: Array<Record<string, unknown>>;
    };

    expect(FLOOR_PLAN_SCHEMA_VERSION).toBe(3);
    expect(parsed.schemaVersion).toBe(FLOOR_PLAN_SCHEMA_VERSION);
    expect(Object.keys(parsed)).toEqual(["schemaVersion", "title", "categories", "floors"]);
    expect(parsed.categories).toEqual(CATEGORIES);
    expect(parsed.floors[0]).toMatchObject({
      id: "floor-1",
      name: "Ground floor",
      rows: 1,
      cols: 3,
    });
  });

  it("emits one short token per cell and RLE runs for empty floor and void", () => {
    expect(wireRow([EMPTY, VOID, MACHINE])).toEqual(["e", "v", "m:0"]);
    expect(wireRow([EMPTY, EMPTY, EMPTY])).toEqual([["e", 3]]);
    expect(wireRow([VOID, VOID, EMPTY, VOID])).toEqual([["v", 2], "e", "v"]);
    expect(wireRow([MACHINE, MACHINE_LABELLED, EMPTY])).toEqual(["m:0", "m:0:Chest press", "e"]);
  });

  it("references categories by array index, not by id string", () => {
    const cells = wireRow([MACHINE, MACHINE_SECOND]);

    expect(cells).toEqual(["m:0", "m:1"]);
    const json = JSON.stringify(cells);
    expect(json).not.toContain("cat-1");
    expect(json).not.toContain("cat-2");
  });

  it("no longer writes cell objects for empty squares", () => {
    const plan = makePlan([
      [EMPTY, EMPTY],
      [EMPTY, MACHINE_LABELLED],
    ]);
    const json = serialized(plan);

    expect(json).not.toContain('{"kind":"empty"');
    expect(json).not.toContain('"categoryId"');
    expect(json).toContain('"cells":[[["e",2]],["e","m:0:Chest press"]]');
  });

  it("is dramatically smaller than the v1 dense form for one empty row", () => {
    // A full row of 40 empty squares: v1 writes 40 cell objects, v2 one run.
    const cells: FloorCell[][] = [[...Array(40)].map(() => EMPTY)];
    const v2 = Buffer.byteLength(JSON.stringify(wireRow(cells[0])), "utf8");
    const v1 = Buffer.byteLength(
      JSON.stringify([...Array(40)].map(() => ({ kind: "empty" }))),
      "utf8"
    );

    expect(v2).toBe(10); // [["e",40]]
    expect(v1).toBeGreaterThan(400);
    expect(v2 * 40).toBeLessThan(v1);
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe("v2 round-trip", () => {
  it("round-trips every cell kind, with and without a machine label", () => {
    const cells: FloorCell[][] = [
      [EMPTY, VOID, MACHINE, MACHINE_LABELLED, MACHINE_SECOND],
      [MACHINE_LABELLED, MACHINE_LABELLED, VOID, VOID, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY, MACHINE],
    ];

    expect(roundTrip(cells)).toEqual(cells);
  });

  it("round-trips every pairwise adjacency of the four cell kinds", () => {
    const kinds: FloorCell[] = [EMPTY, VOID, MACHINE, MACHINE_LABELLED];
    for (const left of kinds) {
      for (const right of kinds) {
        expect(roundTrip([[left, right]])).toEqual([[left, right]]);
      }
    }
  });

  it("preserves a machine label containing a colon and non-ASCII text", () => {
    const labelled: FloorCell = {
      kind: "machine",
      categoryId: "cat-2",
      label: "Πρέσα: chest press",
    };
    expect(roundTrip([[labelled, EMPTY]])).toEqual([[labelled, EMPTY]]);
  });

  it("round-trips an all-empty, all-void and all-machine row", () => {
    const row: FloorCell[][] = [[...Array(7)].map(() => EMPTY)];
    expect(roundTrip(row)).toEqual(row);

    const voidRow: FloorCell[][] = [[...Array(7)].map(() => VOID)];
    expect(roundTrip(voidRow)).toEqual(voidRow);

    const machineRow: FloorCell[][] = [[...Array(7)].map(() => MACHINE)];
    expect(roundTrip(machineRow)).toEqual(machineRow);
  });

  it("round-trips a multi-floor plan with different grid sizes", () => {
    const plan = createEmptyPlan({ rows: 3, cols: 3, title: "Two floors" });
    const twoFloors: GymFloorPlan = {
      ...plan,
      categories: CATEGORIES.map((category) => ({ ...category })),
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          rows: 2,
          cols: 2,
          cells: [
            [MACHINE, VOID],
            [EMPTY, EMPTY],
          ],
        },
        {
          id: "floor-2",
          name: "First",
          rows: 1,
          cols: 4,
          cells: [[VOID, VOID, MACHINE_SECOND, EMPTY]],
        },
      ],
    };

    const result = deserializePlan(serialized(twoFloors));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toEqual(twoFloors);
  });
});

// ---------------------------------------------------------------------------
// Run boundaries
// ---------------------------------------------------------------------------

describe("v2 run boundaries", () => {
  it("keeps a run of one as a bare token instead of a run of length 1", () => {
    expect(encodeRow([EMPTY])).toEqual(["e"]);
    expect(encodeRow([VOID])).toEqual(["v"]);
    expect(collapseEmptyAndVoidRuns([EMPTY_CELL_TOKEN])).toEqual(["e"]);
    expect(collapseEmptyAndVoidRuns([VOID_CELL_TOKEN])).toEqual(["v"]);
  });

  it("never turns a run of one into a run of zero or consumes its neighbour", () => {
    const cells: FloorCell[][] = [[EMPTY, MACHINE, EMPTY, VOID, MACHINE]];
    expect(encodeRow(cells[0])).toEqual(["e", "m:0", "e", "v", "m:0"]);
    expect(roundTrip(cells)).toEqual(cells);
  });

  it("encodes runs at the start, middle and end of a row", () => {
    const cells: FloorCell[][] = [
      [EMPTY, EMPTY, MACHINE, VOID, VOID, VOID, EMPTY, MACHINE, EMPTY, EMPTY],
    ];
    expect(encodeRow(cells[0])).toEqual([["e", 2], "m:0", ["v", 3], "e", "m:0", ["e", 2]]);
    expect(roundTrip(cells)).toEqual(cells);
  });

  it("encodes a full-row run of 40 and expands it back to 40 cells", () => {
    const cells: FloorCell[][] = [[...Array(40)].map(() => EMPTY)];
    expect(encodeRow(cells[0])).toEqual([["e", 40]]);

    const decoded = roundTrip(cells);
    expect(decoded[0]).toHaveLength(40);
    expect(decoded[0].every((cell) => cell.kind === "empty")).toBe(true);
  });

  it("keeps two adjacent runs of the same kind merged and different kinds separate", () => {
    expect(collapseEmptyAndVoidRuns(["e", "e", "v", "v", "e"])).toEqual([["e", 2], ["v", 2], "e"]);
  });

  it("does not RLE machine cells, even a run of identical ones", () => {
    const row = [...Array(5)].map(() => MACHINE);
    expect(encodeRow(row)).toEqual(["m:0", "m:0", "m:0", "m:0", "m:0"]);
  });
});

// ---------------------------------------------------------------------------
// Category index stability
// ---------------------------------------------------------------------------

describe("v2 category index stability", () => {
  it("keeps cells that reference the second category", () => {
    const cells: FloorCell[][] = [[MACHINE, MACHINE_SECOND, MACHINE_LABELLED, MACHINE_SECOND]];
    expect(wireRow(cells[0])).toEqual(["m:0", "m:1", "m:0:Chest press", "m:1"]);
    expect(roundTrip(cells)).toEqual(cells);
  });

  it("still produces a valid plan after deleting a category and re-serializing", () => {
    let plan = makePlan([[MACHINE_SECOND, MACHINE, EMPTY]]);
    // Deleting cat-1 moves its squares; cat-2 is now index 0.
    plan = {
      ...plan,
      categories: [CATEGORIES[1]],
      floors: plan.floors.map((floor) => ({
        ...floor,
        cells: floor.cells.map((row) =>
          row.map((cell): FloorCell =>
            cell.kind === "machine" && cell.categoryId === "cat-1" ? EMPTY : cell
          )
        ),
      })),
    };

    const json = serialized(plan);
    expect(json).toContain('"id":"cat-2"');
    expect(json).toContain('"m:0"');

    const result = deserializePlan(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.floors[0].cells).toEqual([[MACHINE_SECOND, EMPTY, EMPTY]]);
  });

  it("rejects a machine token whose index is outside the categories array", () => {
    const raw = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Bad index",
      categories: [CATEGORIES[0]],
      floors: [{ id: "floor-1", name: "Ground", rows: 1, cols: 2, cells: [["m:0", "m:7"]] }],
    };

    const result = parsePlanValue(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe("unknown-category");
    expect(result.issues[0].path).toBe("floors[0].cells[0][1]");
  });
});

// ---------------------------------------------------------------------------
// v1 -> v2 migration
// ---------------------------------------------------------------------------

const V1_FIXTURE = {
  schemaVersion: 1,
  title: "Legacy plan",
  categories: [
    { id: "cat-1", name: "Impulse", color: "#2563EB", shortLabel: "IM", pattern: "solid" },
    { id: "cat-2", name: "Arsenal", color: "#DC2626", shortLabel: "AR", pattern: "diagonal" },
  ],
  floors: [
    {
      id: "floor-1",
      name: "Ground floor",
      rows: 3,
      cols: 4,
      cells: [
        [
          { kind: "empty" },
          { kind: "machine", categoryId: "cat-2" },
          { kind: "machine", categoryId: "cat-1", label: "Chest press" },
          { kind: "void" },
        ],
        [{ kind: "empty" }, { kind: "empty" }, { kind: "empty" }, { kind: "empty" }],
        [
          { kind: "void" },
          { kind: "void" },
          { kind: "machine", categoryId: "cat-2" },
          { kind: "empty" },
        ],
      ],
    },
  ],
};

const V1_EXPECTED: FloorCell[][] = [
  [EMPTY, MACHINE_SECOND, MACHINE_LABELLED, VOID],
  [EMPTY, EMPTY, EMPTY, EMPTY],
  [VOID, VOID, MACHINE_SECOND, EMPTY],
];

describe("v1 -> v2 migration", () => {
  it("migrates a hand-written v1 record to the same in-memory grid", () => {
    const result = deserializePlan(JSON.stringify(V1_FIXTURE));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.schemaVersion).toBe(FLOOR_PLAN_SCHEMA_VERSION);
    expect(result.plan.floors[0].cells).toEqual(V1_EXPECTED);
    expect(result.plan.categories).toEqual(V1_FIXTURE.categories);
  });

  it("converts a bare v1 record into v2 token rows", () => {
    const migrated = migrateV1PlanRecord(JSON.parse(JSON.stringify(V1_FIXTURE)));

    expect(migrated.schemaVersion).toBe(2);
    const floors = migrated.floors as Array<{ cells: unknown }>;
    expect(floors[0].cells).toEqual([
      ["e", "m:1", "m:0:Chest press", "v"],
      [["e", 4]],
      [["v", 2], "m:1", "e"],
    ]);
  });

  it("re-serializes a migrated v1 plan back to the same plan", () => {
    const result = deserializePlan(JSON.stringify(V1_FIXTURE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const again = deserializePlan(serializePlan(result.plan));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.plan).toEqual(result.plan);
  });

  it("rejects a v1 plan whose cell references an unknown category", () => {
    const broken = JSON.parse(JSON.stringify(V1_FIXTURE)) as typeof V1_FIXTURE;
    broken.floors[0].cells[0][1] = { kind: "machine", categoryId: "cat-ghost" };

    const result = deserializePlan(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain("unknown-category");
    // The offending square must be reported, not silently dropped.
    expect(result.issues.some((issue) => issue.path?.startsWith("floors[0].cells[0]"))).toBe(true);

    // It must also fail validation directly, not just deserialization.
    expect(validatePlan(broken).errors.map((issue) => issue.code)).toContain("unknown-category");
  });

  it("rejects a v2 token row that falsely claims schemaVersion 1", () => {
    const disguised = {
      schemaVersion: 1,
      title: "Disguised",
      categories: [CATEGORIES[0]],
      floors: [{ id: "floor-1", name: "Ground", rows: 1, cols: 2, cells: [["e", "m:0"]] }],
    };

    const result = parsePlanValue(disguised);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain("invalid-cell");
  });

  it("does not accept a v1 cell object in the v2 shape check as a token", () => {
    // A v1 body under a v2 label is tolerated (the decoder accepts the expanded
    // form), but it must decode to cells, never to a token passthrough.
    const upgraded = {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "v1 body, v2 label",
      categories: [CATEGORIES[0]],
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          rows: 1,
          cols: 2,
          cells: [[{ kind: "empty" }, { kind: "empty" }]],
        },
      ],
    };

    const result = parsePlanValue(upgraded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.floors[0].cells).toEqual([[EMPTY, EMPTY]]);
  });
});

// ---------------------------------------------------------------------------
// Malformed RLE
// ---------------------------------------------------------------------------

describe("malformed RLE is rejected with an issue, never thrown", () => {
  function expectIssue(cells: unknown[], cols: number, code: string, pathPart?: string) {
    const decoded = decodeResult(cells, cols);
    expect(decoded.cells).toBeNull();
    const codes = decoded.errors.map((issue) => issue.code);
    expect(codes).toContain(code);
    if (pathPart !== undefined) {
      expect(decoded.errors.some((issue) => issue.path?.includes(pathPart))).toBe(true);
    }
  }

  function planWithCells(cells: unknown[], rows: number, cols: number): Record<string, unknown> {
    return {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: "Malformed",
      categories: [CATEGORIES[0]],
      floors: [{ id: "floor-1", name: "Ground", rows, cols, cells }],
    };
  }

  it("rejects a run of length 0", () => {
    expectIssue([[["e", 0]]], 4, "invalid-cells");
    expect(parsePlanValue(planWithCells([[["e", 0]]], 1, 4)).ok).toBe(false);
  });

  it("rejects a negative run length", () => {
    expectIssue([[["v", -3]]], 4, "invalid-cells");
  });

  it("rejects a non-integer and a non-numeric run length", () => {
    expectIssue([[["e", 1.5]]], 4, "invalid-cells");
    expectIssue([[["e", "4"]]], 4, "invalid-cells");
    expectIssue([[["e", null]]], 4, "invalid-cells");
  });

  it("rejects a run longer than the row", () => {
    expectIssue([[["e", 5]]], 4, "invalid-cells");
    // The overflow message names the remaining columns.
    const decoded = decodeResult(
      [
        [
          ["e", 2],
          ["e", 3],
        ],
      ],
      4
    );
    expect(decoded.cells).toBeNull();
    expect(decoded.errors[0].message).toContain("overflow");
  });

  it("rejects an unknown token", () => {
    expectIssue([["x"]], 1, "invalid-cell");
    expectIssue([["m:"]], 1, "invalid-cell");
    expectIssue([["m:x"]], 1, "invalid-cell");
    expectIssue([["M:0"]], 1, "invalid-cell");
    expectIssue([["empty"]], 1, "invalid-cell");
  });

  it("rejects a run token that carries a machine kind", () => {
    expectIssue([[["m:0", 2]]], 2, "invalid-cells");
  });

  it("rejects a run token with the wrong arity", () => {
    expectIssue([[["e"]]], 2, "invalid-cells");
    expectIssue([[["e", 1, 1]]], 2, "invalid-cells");
  });

  it("rejects a non-array token that is neither string nor object", () => {
    expectIssue([[42]], 1, "invalid-cells");
    expectIssue([[null]], 1, "invalid-cells");
  });

  it("rejects a row that decodes short of the declared width", () => {
    expectIssue([[["e", 3]]], 4, "invalid-cells");
  });

  it("rejects extra cells past the declared width", () => {
    expectIssue([[["e", 4], "v"]], 4, "invalid-cells");
    expectIssue([["e", "e", "e"]], 2, "invalid-cells");
  });

  it("never throws on hostile shapes", () => {
    const hostile: unknown[][] = [
      [[]],
      [[["e", 1]]],
      [[{}]],
      [[["e", Number.NaN]]],
      [[["e", Number.POSITIVE_INFINITY]]],
      [[["e", 2 ** 53]]],
      [[["", 1]]],
      [[["E", 1]]],
    ];
    for (const cells of hostile) {
      expect(() => decodeResult(cells, 2)).not.toThrow();
    }
  });

  it("reports malformed RLE through validatePlan too", () => {
    const result: ValidationResult = validatePlan(planWithCells([[["e", 0]]], 1, 4));
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain("invalid-cells");
  });

  it("reports a ragged v2 row count", () => {
    const result = validatePlan(planWithCells([[["e", 2]]], 2, 2));
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain("invalid-cells");
  });

  it("keeps the v1 error codes for bad machine references in expanded form", () => {
    // The cell-body validation moved into the decoder, so these guard the error
    // codes the module reported before schema v2.
    const cases: unknown[][] = [
      [{ kind: "machine", categoryId: "" }],
      [{ kind: "machine" }],
      [{ kind: "machine", categoryId: 42 }],
      [{ kind: "machine", categoryId: "cat-1", label: 5 }],
    ];
    for (const cells of cases) {
      const result = validatePlan(planWithCells([cells], 1, cells.length));
      expect(result.valid).toBe(false);
      expect(result.errors.map((issue) => issue.code)).toContain("invalid-cell");
    }

    const unknown = validatePlan(planWithCells([[{ kind: "machine", categoryId: "ghost" }]], 1, 1));
    expect(unknown.errors.map((issue) => issue.code)).toContain("unknown-category");
  });

  it("reports a non-array row and an unsupported expanded cell kind", () => {
    const notARow = validatePlan(planWithCells(["e", "v"] as unknown[], 1, 2));
    expect(notARow.valid).toBe(false);
    expect(notARow.errors.map((issue) => issue.code)).toContain("invalid-cells");

    const badKind = validatePlan(planWithCells([[{ kind: "desk" }, "e"]], 1, 2));
    expect(badKind.valid).toBe(false);
    expect(badKind.errors.map((issue) => issue.code)).toContain("invalid-cell");
  });

  it("reports an expanded machine cell with a missing or over-long label", () => {
    const missing = validatePlan(
      planWithCells([[{ kind: "machine", categoryId: "cat-1" }, { kind: "machine" }]], 1, 2)
    );
    expect(missing.valid).toBe(false);
    expect(missing.errors.map((issue) => issue.code)).toContain("invalid-cell");

    const overLong = validatePlan(
      planWithCells([[{ kind: "machine", categoryId: "cat-1", label: "x".repeat(41) }, "e"]], 1, 2)
    );
    expect(overLong.valid).toBe(false);
    expect(overLong.errors.map((issue) => issue.code)).toContain("invalid-cell");
  });

  it("does not expand rows beyond the declared row count", () => {
    // Three rows declared as one: the surplus must not be decoded, and the
    // surplus is already reported as an invalid row count.
    const decoded = decodeFloorRows(
      [[["e", 2]], [["e", 2 ** 20]]],
      2,
      ["cat-1"],
      "floors[0].cells",
      1
    );
    expect(decoded.errors).toEqual([]);
    expect(decoded.cells).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Interaction with the existing API
// ---------------------------------------------------------------------------

describe("v2 serialization keeps the public contract", () => {
  it("still validates before writing and refuses an invalid plan", () => {
    const plan = makePlan([[EMPTY]]);
    const invalid = {
      ...plan,
      categories: [{ ...CATEGORIES[0], color: "not-a-colour" }],
    } as unknown as GymFloorPlan;

    expect(() => serialized(invalid)).toThrowError(/Cannot serialize an invalid floor plan/);
  });

  it("round-trips a plan edited through setCell", () => {
    let plan = createEmptyPlan({ rows: 4, cols: 4 });
    plan = addCategory(plan, { id: "cat-1", name: "Impulse", color: "#2563eb" });
    plan = setCell(plan, "floor-1", 1, 1, MACHINE_LABELLED);

    const result = deserializePlan(serialized(plan));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toEqual(plan);
  });

  it("rejects a schema version newer than the module", () => {
    const raw = {
      ...JSON.parse(serialized(makePlan([[EMPTY]]))),
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION + 1,
    };
    const result = parsePlanValue(raw);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe("unsupported-schema-version");
  });

  it("exposes the token constants for hosts that build fixtures", () => {
    expect(EMPTY_CELL_TOKEN).toBe("e");
    expect(VOID_CELL_TOKEN).toBe("v");
  });
});
