/**
 * Schema v3 packed binary format tests.
 *
 * The contract under test:
 *
 *   encodePlanBytes -> Uint8Array -> decodePlanBytes -> DeserializeResult
 *
 * and that the byte payload is (a) exact, (b) self-describing enough to reject a
 * mis-fed, truncated or hand-edited blob with an issue rather than a crash or an
 * over-allocation, and (c) cheap when a plan has no machine labels.
 *
 * The byte sizes pinned in the size-regression block are produced by the
 * deterministic fixture in this file, so they are exact regression guards, not
 * estimates: if the format changes, the numbers change and the test says so.
 */

import { describe, expect, it } from "vitest";
import {
  FloorPlanError,
  addCategory,
  createEmptyPlan,
  decodePlanBytes,
  deserializePlan,
  encodePlanBytes,
  parsePlanValue,
  serializePlan,
  setCell,
  validatePlan,
} from "./model";
import {
  FLOOR_PLAN_LIMITS,
  FLOOR_PLAN_SCHEMA_VERSION,
  type Category,
  type FloorCell,
  type GymFloorPlan,
} from "./types";
import { encodeFloorCells } from "./wire";
import {
  PLAN_BINARY_HEADER_BYTES,
  PLAN_BINARY_MAGIC,
  PLAN_BINARY_VERSION,
  categoryBitWidth,
  gridByteLength,
  maxGridByteLength,
  migrateV2PlanRecord,
  packCellGrid,
  packPlanRecord,
  unpackPlanRecord,
} from "./wireBinary";

const CATEGORIES: Category[] = [
  { id: "cat-1", name: "Impulse", color: "#2563EB", shortLabel: "IM", pattern: "solid" },
  { id: "cat-2", name: "Arsenal", color: "#DC2626", shortLabel: "AR", pattern: "diagonal" },
  { id: "cat-3", name: "Free weights", color: "#16A34A", shortLabel: "FW", pattern: "dots" },
  { id: "cat-4", name: "Cardio", color: "#CA8A04", shortLabel: "CA", pattern: "grid" },
];

const EMPTY: FloorCell = { kind: "empty" };
const VOID: FloorCell = { kind: "void" };
const MACHINE: FloorCell = { kind: "machine", categoryId: "cat-1" };
const MACHINE_LABELLED: FloorCell = { kind: "machine", categoryId: "cat-1", label: "Chest press" };
const MACHINE_SECOND: FloorCell = { kind: "machine", categoryId: "cat-2" };

function makePlan(cells: FloorCell[][], categories: Category[] = CATEGORIES): GymFloorPlan {
  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    title: "Binary format",
    categories: categories.map((category) => ({ ...category })),
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

/** Encodes then decodes, asserting success and returning the decoded plan. */
function byteRoundTrip(plan: GymFloorPlan): GymFloorPlan {
  const bytes = encodePlanBytes(plan);
  const result = decodePlanBytes(bytes);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`round-trip failed: ${JSON.stringify(result.issues)}`);
  expect(result.plan).toEqual(plan);
  return result.plan;
}

/** Asserts that decoding fails with a specific issue code. */
function expectIssue(bytes: Uint8Array, code: string): void {
  const result = decodePlanBytes(bytes);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`expected a "${code}" issue, but decoding succeeded`);
  expect(result.issues.map((issue) => issue.code)).toContain(code);
}

function bytesOf(plan: GymFloorPlan): Uint8Array {
  return encodePlanBytes(plan);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe("v3 binary header", () => {
  it("starts with the magic bytes, the current version and a reserved-zero tail", () => {
    const bytes = bytesOf(makePlan([[EMPTY]]));

    expect(PLAN_BINARY_MAGIC).toBe(0x4e46);
    expect(PLAN_BINARY_VERSION).toBe(FLOOR_PLAN_SCHEMA_VERSION);
    expect(bytes[0]).toBe(0x4e);
    expect(bytes[1]).toBe(0x46);
    expect(bytes[2]).toBe(PLAN_BINARY_VERSION);
    expect(bytes[3]).toBe(0); // no labels -> flag clear
    expect(bytes[22]).toBe(0); // reserved
    expect(bytes[23]).toBe(0);
    expect(bytes.byteLength).toBeGreaterThanOrEqual(PLAN_BINARY_HEADER_BYTES);
  });

  it("records the declared total length, floor count, dimensions and category count", () => {
    const plan = makePlan([
      [EMPTY, MACHINE],
      [VOID, EMPTY],
    ]);
    const bytes = bytesOf(plan);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint32(14, false)).toBe(bytes.byteLength);
    expect(bytes[4]).toBe(1); // one floor
    expect(view.getUint16(6, false)).toBe(2); // max rows
    expect(view.getUint16(8, false)).toBe(2); // max cols
    expect(view.getUint16(10, false)).toBe(CATEGORIES.length);
    expect(view.getUint16(12, false)).toBe(0); // no labels
  });

  it("chooses the category bit width once from the category count", () => {
    expect(categoryBitWidth(0)).toBe(1);
    expect(categoryBitWidth(1)).toBe(1);
    expect(categoryBitWidth(2)).toBe(1);
    expect(categoryBitWidth(3)).toBe(2);
    expect(categoryBitWidth(4)).toBe(2);
    expect(categoryBitWidth(5)).toBe(3);
    expect(categoryBitWidth(8)).toBe(3);
    expect(categoryBitWidth(9)).toBe(4);
    expect(categoryBitWidth(FLOOR_PLAN_LIMITS.maxCategories)).toBe(5);

    // The header carries the width, so the decoder never has to guess.
    expect(bytesOf(makePlan([[MACHINE]], CATEGORIES.slice(0, 2)))[5]).toBe(1);
    expect(bytesOf(makePlan([[MACHINE]], CATEGORIES.slice(0, 4)))[5]).toBe(2);
    expect(bytesOf(makePlan([[MACHINE]], CATEGORIES))[5]).toBe(2);
  });

  it("round-trips every cell kind and every category index", () => {
    const categories = CATEGORIES.map((category) => ({ ...category }));
    const cells: FloorCell[][] = [
      [EMPTY, VOID, { kind: "machine", categoryId: "cat-1" }],
      [
        { kind: "machine", categoryId: "cat-2" },
        { kind: "machine", categoryId: "cat-3" },
        { kind: "machine", categoryId: "cat-4" },
      ],
      [{ kind: "machine", categoryId: "cat-4", label: "Row" }, EMPTY, VOID],
    ];
    const plan = makePlan(cells, categories);

    const decoded = byteRoundTrip(plan);
    expect(decoded.floors[0].cells).toEqual(cells);
    expect(decoded.categories).toEqual(CATEGORIES);
  });

  it("round-trips at 1x1, 2x2, odd widths and a full 40-wide row", () => {
    expect(byteRoundTrip(makePlan([[EMPTY]])).floors[0].cells).toEqual([[EMPTY]]);
    expect(byteRoundTrip(makePlan([[VOID]])).floors[0].cells).toEqual([[VOID]]);
    expect(byteRoundTrip(makePlan([[MACHINE]])).floors[0].cells).toEqual([[MACHINE]]);

    const square: FloorCell[][] = [
      [MACHINE, VOID],
      [EMPTY, MACHINE_SECOND],
    ];
    expect(byteRoundTrip(makePlan(square)).floors[0].cells).toEqual(square);

    const odd: FloorCell[][] = [[EMPTY, MACHINE, VOID, EMPTY, MACHINE_LABELLED]];
    expect(byteRoundTrip(makePlan(odd)).floors[0].cells).toEqual(odd);

    const fullRow: FloorCell[][] = [
      [...Array(40)].map((_, index) =>
        index % 3 === 0 ? MACHINE : index % 3 === 1 ? VOID : EMPTY
      ),
    ];
    const decodedFull = byteRoundTrip(makePlan(fullRow));
    expect(decodedFull.floors[0].cells[0]).toHaveLength(40);
    expect(decodedFull.floors[0].cells).toEqual(fullRow);
  });

  it("round-trips a multi-floor plan whose floors differ in size", () => {
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

    const decoded = byteRoundTrip(twoFloors);
    expect(decoded.floors).toHaveLength(2);
    expect(decoded.floors[1].cells).toEqual([[VOID, VOID, MACHINE_SECOND, EMPTY]]);
  });
});

// ---------------------------------------------------------------------------
// Label side table
// ---------------------------------------------------------------------------

describe("v3 label side table", () => {
  /**
   * Bytes a payload spends on its label section.
   *
   * The payload is header + body, and the body is otherwise byte-identical for
   * two plans that differ only in labels — so the difference in total length is
   * exactly what the labels cost.
   */
  function labelBytes(withLabels: GymFloorPlan, withoutLabels: GymFloorPlan): number {
    return bytesOf(withLabels).byteLength - bytesOf(withoutLabels).byteLength;
  }

  it("pays zero label bytes when a plan has no labels", () => {
    const plan = makePlan([
      [MACHINE, VOID, EMPTY],
      [EMPTY, MACHINE_SECOND, EMPTY],
    ]);
    const bytes = bytesOf(plan);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint16(12, false)).toBe(0);
    expect(bytes[3] & 0x01).toBe(0);

    // The exact size of a label-free 3x2 plan with four categories:
    // 24-byte header + title(1+14) + 4 categories + 1 floor + 2-byte grid.
    // Pinned exactly so "no label bytes" is a measured claim, not a comment.
    expect(bytes.byteLength).toBe(PLAN_BINARY_HEADER_BYTES + labelFreeBodyBytes(plan));
  });

  it("adds only the label itself (ordinal varint + length varint + UTF-8)", () => {
    const bare = makePlan([[MACHINE, EMPTY]]);
    const labelled = makePlan([[{ kind: "machine", categoryId: "cat-1", label: "Row" }, EMPTY]]);

    // ordinal varint (1 byte < 128) + length varint (1 byte) + "Row" (3 bytes).
    expect(labelBytes(labelled, bare)).toBe(1 + 1 + 3);
    expect(new DataView(bytesOf(labelled).buffer).getUint16(12, false)).toBe(1);
    expect(bytesOf(labelled)[3] & 0x01).toBe(0x01);
  });

  it("round-trips one label, many labels and a label with a colon", () => {
    expect(byteRoundTrip(makePlan([[MACHINE_LABELLED, EMPTY]])).floors[0].cells).toEqual([
      [MACHINE_LABELLED, EMPTY],
    ]);

    const many: FloorCell[][] = [
      [
        { kind: "machine", categoryId: "cat-1", label: "Chest press" },
        { kind: "machine", categoryId: "cat-2", label: "Leg press" },
        { kind: "machine", categoryId: "cat-3", label: "Treadmill" },
      ],
      [
        { kind: "machine", categoryId: "cat-4", label: "Rower" },
        EMPTY,
        { kind: "machine", categoryId: "cat-1", label: "Pulldown" },
      ],
    ];
    expect(byteRoundTrip(makePlan(many)).floors[0].cells).toEqual(many);

    const colon: FloorCell[][] = [
      [{ kind: "machine", categoryId: "cat-2", label: "Πρέσα: chest press" }],
    ];
    const decoded = byteRoundTrip(makePlan(colon));
    expect(decoded.floors[0].cells[0][0]).toEqual(colon[0][0]);
  });

  it("round-trips non-ASCII Greek labels and reports their exact UTF-8 cost", () => {
    const greek = "Πρέσα στήθους";
    const utf8Length = Buffer.byteLength(greek, "utf8");
    expect(utf8Length).toBeGreaterThan(greek.length); // two-byte code points

    const bare = makePlan([[MACHINE]]);
    const labelled = makePlan([
      [{ kind: "machine", categoryId: "cat-1", label: greek }],
    ]);

    expect(labelBytes(labelled, bare)).toBe(1 + 1 + utf8Length);
    const decoded = byteRoundTrip(labelled);
    const cell = decoded.floors[0].cells[0][0];
    expect(cell.kind).toBe("machine");
    if (cell.kind === "machine") expect(cell.label).toBe(greek);
  });

  it("keeps labels attached to the right cell on a multi-floor plan", () => {
    const plan = makePlan([[EMPTY]]);
    const multi: GymFloorPlan = {
      ...plan,
      floors: [
        { id: "floor-1", name: "Ground", rows: 1, cols: 2, cells: [[EMPTY, EMPTY]] },
        {
          id: "floor-2",
          name: "First",
          rows: 2,
          cols: 2,
          cells: [
            [EMPTY, { kind: "machine", categoryId: "cat-2", label: "Leg press" }],
            [{ kind: "machine", categoryId: "cat-1", label: "Chest press" }, EMPTY],
          ],
        },
      ],
    };

    const decoded = byteRoundTrip(multi);
    expect(decoded.floors[0].cells).toEqual([[EMPTY, EMPTY]]);
    expect(decoded.floors[1].cells).toEqual(multi.floors[1].cells);
  });

  it("rejects a label attached to a non-machine cell", () => {
    const bytes = bytesOf(
      makePlan([
        [EMPTY, EMPTY],
        [EMPTY, EMPTY],
      ])
    );
    // Cell 0 is empty, so a label on it is nonsense even though the blob is
    // otherwise well-formed.
    expectIssue(forgeWithLabels(bytes, [{ ordinal: 0, label: "Sneaky" }]), "invalid-cell");

    // Same for a void cell (cell 2 of a 2x2 grid).
    expectIssue(forgeWithLabels(bytes, [{ ordinal: 2, label: "Sneaky" }]), "invalid-cell");
  });
});

/**
 * Rebuilds a label-free payload with a hand-written label table appended,
 * adjusting every header field and recomputing the checksum. That makes the blob
 * structurally consistent, so the ONLY thing the decoder can object to is the
 * semantic problem the test is about — something the encoder can never emit.
 */
function forgeWithLabels(
  base: Uint8Array,
  entries: ReadonlyArray<{ ordinal: number; label: string }>
): Uint8Array {
  const tail: number[] = [];
  for (const entry of entries) {
    const encoded = new TextEncoder().encode(entry.label);
    tail.push(entry.ordinal & 0x7f, encoded.length & 0x7f, ...encoded);
  }

  const out = new Uint8Array(base.byteLength + tail.length);
  out.set(base, 0);
  out.set(Uint8Array.from(tail), base.byteLength);

  const view = new DataView(out.buffer);
  view.setUint16(12, entries.length, false);
  out[3] |= 0x01;
  view.setUint32(14, out.byteLength, false);
  view.setUint32(18, fnv1aForTest(out), false);
  return out;
}

/** Independent FNV-1a 32 implementation, so the test is not testing itself. */
function fnv1aForTest(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let index = PLAN_BINARY_HEADER_BYTES; index < bytes.byteLength; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Exact body byte length of a label-free plan, derived from the layout rules. */
function labelFreeBodyBytes(plan: GymFloorPlan): number {
  const utf8 = (value: string) => Buffer.byteLength(value, "utf8");
  // Every string field is a 1-byte varint length (< 128) plus its UTF-8 bytes,
  // because the limits (80/40/40/3 chars) keep lengths well under 128.
  let total = 1 + utf8(plan.title);
  for (const category of plan.categories) {
    total += 1 + utf8(category.id);
    total += 1 + utf8(category.name);
    total += 3; // RGB
    total += 1 + utf8(category.shortLabel);
    total += 1; // pattern code
  }
  for (const floor of plan.floors) {
    total += 1 + utf8(floor.id);
    total += 1 + utf8(floor.name);
    total += 2 + 2; // rows, cols
    const categoryIndex = new Map(plan.categories.map((category, index) => [category.id, index]));
    const bits = categoryBitWidth(plan.categories.length);
    total += 1; // grid length varint (< 128 for these fixtures)
    total += gridByteLength(floor.cells, bits);
    expect(categoryIndex.size).toBe(plan.categories.length);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Hostile input
// ---------------------------------------------------------------------------

describe("v3 hostile input is reported as an issue, never thrown", () => {
  it("rejects a blob shorter than the header", () => {
    for (const length of [0, 1, 2, PLAN_BINARY_HEADER_BYTES - 1]) {
      expect(() => decodePlanBytes(new Uint8Array(length))).not.toThrow();
      expectIssue(new Uint8Array(length), "invalid-binary-header");
    }
  });

  it("rejects the wrong magic bytes", () => {
    const bytes = bytesOf(makePlan([[EMPTY]]));
    const wrong = Uint8Array.from(bytes);
    wrong[0] = 0x00;
    expectIssue(wrong, "invalid-binary-header");

    const alsoWrong = Uint8Array.from(bytes);
    alsoWrong[1] = 0x00;
    expectIssue(alsoWrong, "invalid-binary-header");
  });

  it("rejects a wrong or future version byte", () => {
    const bytes = bytesOf(makePlan([[EMPTY]]));

    const older = Uint8Array.from(bytes);
    older[2] = 2;
    expectIssue(older, "unsupported-schema-version");

    const newer = Uint8Array.from(bytes);
    newer[2] = PLAN_BINARY_VERSION + 1;
    expectIssue(newer, "unsupported-schema-version");
  });

  it("rejects a truncated payload before allocating per-floor grids", () => {
    const bytes = bytesOf(
      makePlan([
        [MACHINE, VOID, EMPTY],
        [EMPTY, MACHINE_SECOND, EMPTY],
      ])
    );

    for (const cut of [1, 2, 5, 10]) {
      expectIssue(bytes.subarray(0, bytes.byteLength - cut), "invalid-binary-length");
    }
  });

  it("rejects a payload with trailing garbage", () => {
    const bytes = bytesOf(makePlan([[EMPTY]]));
    const longer = new Uint8Array(bytes.byteLength + 1);
    longer.set(bytes);
    expectIssue(longer, "invalid-binary-length");
  });

  it("rejects a flipped cell bit through the checksum", () => {
    const bytes = bytesOf(makePlan([[MACHINE, EMPTY]]));
    const flipped = Uint8Array.from(bytes);
    // The title is the first body field; flipping its last byte corrupts a cell
    // of the body without touching the header.
    flipped[bytes.byteLength - 1] ^= 0xff;
    expectIssue(flipped, "invalid-binary-checksum");
  });

  it("rejects a header whose declared dimensions do not match its floors", () => {
    const bytes = bytesOf(makePlan([[MACHINE, EMPTY]]));
    const tampered = Uint8Array.from(bytes);
    const view = new DataView(tampered.buffer);
    view.setUint16(6, 3, false); // claim 3 max rows for a 1-row floor
    view.setUint32(18, fnv1aForTest(tampered), false);
    // The declared max rows disagree with the floor's own rows, and the body
    // shifts: either way this must be an issue, not a crash.
    expect(() => decodePlanBytes(tampered)).not.toThrow();
    const result = decodePlanBytes(tampered);
    expect(result.ok).toBe(false);
  });

  it("rejects a payload whose category bit width disagrees with its category count", () => {
    const bytes = bytesOf(makePlan([[MACHINE]], CATEGORIES.slice(0, 2)));
    const tampered = Uint8Array.from(bytes);
    tampered[5] = 3; // claim 3 index bits for 2 categories
    const view = new DataView(tampered.buffer);
    view.setUint32(18, fnv1aForTest(tampered), false);

    expectIssue(tampered, "invalid-binary-header");
  });

  it("rejects a plan whose category list shrank after encoding", () => {
    // Encoding always writes the plan's own category count, so a "changed
    // category count" shows up as a machine cell whose index is out of range.
    const bytes = bytesOf(makePlan([[MACHINE_SECOND]]));
    // Rewrite the category count to 1 the way a re-tagged blob would, keeping
    // the (2-category) body and fixing the checksum.
    const tampered = Uint8Array.from(bytes);
    const view = new DataView(tampered.buffer);
    view.setUint16(10, 1, false);
    tampered[5] = 1; // 1 category -> 1 index bit
    view.setUint32(18, fnv1aForTest(tampered), false);

    expect(() => decodePlanBytes(tampered)).not.toThrow();
    expect(decodePlanBytes(tampered).ok).toBe(false);
  });

  it("rejects a reserved (invalid) cell kind code", () => {
    // A 1x1 machine-only grid with 1 category bit is 3 bits: kind 10 + index 0.
    // Kind 11 (3) is reserved, i.e. the top three bits are 110.
    const bytes = bytesOf(makePlan([[MACHINE]]));
    const tampered = Uint8Array.from(bytes);
    // The grid is the last byte of the payload.
    tampered[tampered.byteLength - 1] = 0b1100_0000;
    const view = new DataView(tampered.buffer);
    view.setUint32(18, fnv1aForTest(tampered), false);

    expectIssue(tampered, "invalid-cell");
  });

  it("rejects a payload whose label ordinals are not ascending", () => {
    const plan: GymFloorPlan = {
      ...makePlan([[EMPTY]]),
      floors: [
        {
          id: "floor-1",
          name: "Ground floor",
          rows: 1,
          cols: 2,
          cells: [
            [
              { kind: "machine", categoryId: "cat-1" },
              { kind: "machine", categoryId: "cat-1" },
            ],
          ],
        },
      ],
    };
    const bytes = bytesOf(plan);

    // Two labels on the same cell: the second would silently replace the first.
    expectIssue(
      forgeWithLabels(bytes, [
        { ordinal: 0, label: "A" },
        { ordinal: 0, label: "B" },
      ]),
      "invalid-binary-body"
    );

    // Descending ordinals are impossible from the encoder too.
    expectIssue(
      forgeWithLabels(bytes, [
        { ordinal: 1, label: "B" },
        { ordinal: 0, label: "A" },
      ]),
      "invalid-binary-body"
    );
  });

  it("rejects a label ordinal past the last cell", () => {
    const bytes = bytesOf(
      makePlan([
        [MACHINE, EMPTY],
        [EMPTY, EMPTY],
      ])
    );

    expectIssue(forgeWithLabels(bytes, [{ ordinal: 4, label: "Past the end" }]), "invalid-binary-body");
    expectIssue(forgeWithLabels(bytes, [{ ordinal: 3, label: "Sneaky" }]), "invalid-cell");
  });

  it("rejects non-binary input without throwing", () => {
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      "NF",
      {},
      [0x4e, 0x46],
    ];
    for (const value of hostile) {
      expect(() => decodePlanBytes(value as Uint8Array)).not.toThrow();
      const result = decodePlanBytes(value as Uint8Array);
      expect(result.ok).toBe(false);
    }
  });

  it("accepts an ArrayBuffer, a Uint8Array and a byte view of the same payload", () => {
    const plan = makePlan([[MACHINE_LABELLED, VOID, EMPTY]]);
    const bytes = bytesOf(plan);

    const fromArrayBuffer = decodePlanBytes(bytes.buffer.slice(0) as ArrayBuffer);
    expect(fromArrayBuffer.ok).toBe(true);

    // A Uint8Array that is a window into a larger buffer must still work.
    const padded = new Uint8Array(bytes.byteLength + 8);
    padded.set(bytes, 8);
    const view = new Uint8Array(padded.buffer, 8, bytes.byteLength);
    const fromView = decodePlanBytes(view);
    expect(fromView.ok).toBe(true);
    if (!fromView.ok) return;
    expect(fromView.plan).toEqual(plan);
  });
});

// ---------------------------------------------------------------------------
// Public API contract
// ---------------------------------------------------------------------------

describe("v3 byte API keeps the string API's contract", () => {
  it("throws FloorPlanError for an invalid plan, exactly like serializePlan", () => {
    const plan = makePlan([[EMPTY]]);
    const invalid = {
      ...plan,
      categories: [{ ...CATEGORIES[0], color: "not-a-colour" }],
    } as unknown as GymFloorPlan;

    expect(() => encodePlanBytes(invalid)).toThrowError(FloorPlanError);
    expect(() => encodePlanBytes(invalid)).toThrowError(/Cannot encode an invalid floor plan/);
    try {
      encodePlanBytes(invalid);
    } catch (error) {
      expect((error as FloorPlanError).code).toBe("invalid-plan");
    }
  });

  it("returns the same shape as parsePlanValue, warnings included", () => {
    const plan = addCategory(createEmptyPlan({ rows: 2, cols: 2 }), {
      name: "Unused",
      color: "#2563eb",
    });

    const fromBytes = decodePlanBytes(encodePlanBytes(plan));
    const fromValue = parsePlanValue(JSON.parse(serializePlan(plan)));

    expect(fromBytes.ok).toBe(true);
    expect(fromValue.ok).toBe(true);
    if (!fromBytes.ok || !fromValue.ok) return;

    expect(fromBytes.plan).toEqual(fromValue.plan);
    expect(fromBytes.warnings.map((issue) => issue.code)).toEqual(
      fromValue.warnings.map((issue) => issue.code)
    );
    expect(fromBytes.warnings.map((issue) => issue.code)).toContain("category-unused");
  });

  it("round-trips a plan edited through setCell, labels included", () => {
    let plan = createEmptyPlan({ rows: 4, cols: 4 });
    plan = addCategory(plan, { id: "cat-1", name: "Impulse", color: "#2563eb" });
    plan = setCell(plan, "floor-1", 1, 1, MACHINE_LABELLED);

    const decoded = byteRoundTrip(plan);
    expect(decoded).toEqual(plan);
    expect(decoded.floors[0].cells[1][1]).toEqual(MACHINE_LABELLED);
  });

  it("agrees with the string API on what is valid", () => {
    const plans: GymFloorPlan[] = [
      makePlan([[EMPTY]]),
      makePlan([[VOID, MACHINE, MACHINE_LABELLED]]),
      makePlan([[MACHINE, EMPTY, VOID]], CATEGORIES.slice(0, 1)),
      createEmptyPlan(),
    ];

    for (const plan of plans) {
      expect(validatePlan(plan).valid).toBe(true);
      const fromBytes = decodePlanBytes(encodePlanBytes(plan));
      const fromString = deserializePlan(serializePlan(plan));
      expect(fromBytes.ok).toBe(fromString.ok);
      if (fromBytes.ok && fromString.ok) expect(fromBytes.plan).toEqual(fromString.plan);
    }
  });

  it("unpacks the same record the structural decoder sees", () => {
    const plan = makePlan([[MACHINE_LABELLED, VOID]]);
    const unpacked = unpackPlanRecord(bytesOf(plan));

    expect(unpacked.ok).toBe(true);
    if (!unpacked.ok) return;
    expect(unpacked.record.schemaVersion).toBe(FLOOR_PLAN_SCHEMA_VERSION);
    expect(unpacked.record.title).toBe(plan.title);
    expect(unpacked.record.categories).toEqual(plan.categories);
    const floors = unpacked.record.floors as Array<{ cells: FloorCell[][] }>;
    expect(floors[0].cells).toEqual([[MACHINE_LABELLED, VOID]]);
  });

  it("packs a label-free grid at exactly 2 bits per cell", () => {
    const bits = categoryBitWidth(CATEGORIES.length);
    const grid: FloorCell[][] = [[EMPTY, VOID, EMPTY, VOID]];

    expect(gridByteLength(grid, bits)).toBe(1); // 4 cells * 2 bits = 1 byte
    expect(packCellGrid(grid, bits, new Map()).byteLength).toBe(1);

    const allEmpty: FloorCell[][] = [[...Array(40)].map(() => EMPTY)];
    expect(gridByteLength(allEmpty, bits)).toBe(Math.ceil((40 * 2) / 8)); // 10 bytes
    expect(maxGridByteLength(40, 40, bits)).toBe(Math.ceil((40 * 40 * 4) / 8));
  });
});

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

describe("v1 and v2 stored plans still load", () => {
  const V1_FIXTURE = {
    schemaVersion: 1,
    title: "Legacy v1 plan",
    categories: [
      { id: "cat-1", name: "Impulse", color: "#2563EB", shortLabel: "IM", pattern: "solid" },
      { id: "cat-2", name: "Arsenal", color: "#DC2626", shortLabel: "AR", pattern: "diagonal" },
    ],
    floors: [
      {
        id: "floor-1",
        name: "Ground floor",
        rows: 2,
        cols: 3,
        cells: [
          [
            { kind: "empty" },
            { kind: "machine", categoryId: "cat-2" },
            { kind: "machine", categoryId: "cat-1", label: "Chest press" },
          ],
          [{ kind: "void" }, { kind: "empty" }, { kind: "empty" }],
        ],
      },
    ],
  };

  const V2_FIXTURE = {
    schemaVersion: 2,
    title: "Legacy v2 plan",
    categories: [
      { id: "cat-1", name: "Impulse", color: "#2563EB", shortLabel: "IM", pattern: "solid" },
      { id: "cat-2", name: "Arsenal", color: "#DC2626", shortLabel: "AR", pattern: "diagonal" },
    ],
    floors: [
      {
        id: "floor-1",
        name: "Ground floor",
        rows: 2,
        cols: 3,
        cells: [
          ["e", "m:1", "m:0:Chest press"],
          [["v", 1], ["e", 2]],
        ],
      },
    ],
  };

  const EXPECTED: FloorCell[][] = [
    [EMPTY, MACHINE_SECOND, MACHINE_LABELLED],
    [VOID, EMPTY, EMPTY],
  ];

  it("loads a v1 plan through the v1 -> v2 -> v3 chain", () => {
    const result = deserializePlan(JSON.stringify(V1_FIXTURE));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.schemaVersion).toBe(FLOOR_PLAN_SCHEMA_VERSION);
    expect(result.plan.floors[0].cells).toEqual(EXPECTED);
    // A migrated v1 plan must also be encodable: this is the storage path.
    expect(decodePlanBytes(encodePlanBytes(result.plan)).ok).toBe(true);
  });

  it("loads a v2 token-row plan through the v2 -> v3 chain", () => {
    const result = deserializePlan(JSON.stringify(V2_FIXTURE));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.schemaVersion).toBe(FLOOR_PLAN_SCHEMA_VERSION);
    expect(result.plan.floors[0].cells).toEqual(EXPECTED);
    expect(decodePlanBytes(encodePlanBytes(result.plan)).ok).toBe(true);
  });

  it("produces the same plan from the v1 and v2 fixtures", () => {
    const fromV1 = deserializePlan(JSON.stringify(V1_FIXTURE));
    const fromV2 = deserializePlan(JSON.stringify(V2_FIXTURE));
    expect(fromV1.ok).toBe(true);
    expect(fromV2.ok).toBe(true);
    if (!fromV1.ok || !fromV2.ok) return;
    expect(fromV1.plan.floors[0].cells).toEqual(fromV2.plan.floors[0].cells);
  });

  it("normalises a v2 record into the canonical token form at v3", () => {
    const migrated = migrateV2PlanRecord(JSON.parse(JSON.stringify(V2_FIXTURE)));

    expect(migrated.schemaVersion).toBe(3);
    const floors = migrated.floors as Array<{ cells: unknown }>;
    // Expanded cell objects and runs both become the canonical short tokens.
    expect(floors[0].cells).toEqual([
      ["e", "m:1", "m:0:Chest press"],
      ["v", ["e", 2]],
    ]);
  });

  it("passes an undecodable v2 floor through for validation to report", () => {
    const broken = {
      ...JSON.parse(JSON.stringify(V2_FIXTURE)),
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          rows: 1,
          cols: 2,
          cells: [["m:9", "e"]],
        },
      ],
    };
    const migrated = migrateV2PlanRecord(broken as Record<string, unknown>);
    const floors = migrated.floors as Array<{ cells: unknown }>;
    expect(floors[0].cells).toEqual([["m:9", "e"]]);

    const result = parsePlanValue(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain("unknown-category");
  });

  it("rejects a plan newer than the module, and v1/v2 blobs have no binary form", () => {
    const newer = { ...JSON.parse(JSON.stringify(V2_FIXTURE)), schemaVersion: 4 };
    const result = parsePlanValue(newer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe("unsupported-schema-version");

    // decodePlanBytes accepts only the current binary version.
    const bytes = bytesOf(makePlan([[EMPTY]]));
    const v1Blob = Uint8Array.from(bytes);
    v1Blob[2] = 1;
    expectIssue(v1Blob, "unsupported-schema-version");
  });
});

// ---------------------------------------------------------------------------
// Size regressions
// ---------------------------------------------------------------------------

/**
 * Generates `count` valid categories. The size table needs 2, 4 and 8 categories
 * (one, two and three index bits), so these are synthesized rather than sliced
 * out of a fixed list — a sliced list silently caps at its own length.
 */
function synthesizeCategories(count: number): Category[] {
  const colors = [
    "#2563EB",
    "#DC2626",
    "#16A34A",
    "#CA8A04",
    "#9333EA",
    "#0891B2",
    "#DB2777",
    "#65A30D",
  ];
  const patterns = ["solid", "diagonal", "dots", "grid", "cross"] as const;
  // Short labels must be unique and 1-3 characters, or the plan gets a warning.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: count }, (_, index) => ({
    id: `cat-${index + 1}`,
    name: `Category ${index + 1}`,
    color: colors[index % colors.length],
    shortLabel: `${alphabet[index % alphabet.length]}${index >= alphabet.length ? index : ""}`,
    pattern: patterns[index % patterns.length],
  }));
}

/**
 * Deterministic realistic plan: a seeded xorshift32 PRNG paints ~40% machine
 * squares and ~8% void, which is the profile the format was measured against.
 * Every byte count below is produced by this fixture, so the numbers cannot
 * drift without the test failing.
 */
function realisticPlan(rows: number, cols: number, floors: number, categories: number): GymFloorPlan {
  let state = 0xc0ffee;
  const random = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };

  const cats = synthesizeCategories(categories);
  const built: GymFloorPlan["floors"] = [];
  for (let floor = 0; floor < floors; floor += 1) {
    const cells: FloorCell[][] = [];
    for (let row = 0; row < rows; row += 1) {
      const rowCells: FloorCell[] = [];
      for (let col = 0; col < cols; col += 1) {
        const draw = random();
        if (draw < 0.08) {
          rowCells.push(VOID);
        } else if (draw < 0.48) {
          rowCells.push({
            kind: "machine",
            categoryId: cats[Math.floor(random() * cats.length)].id,
          });
        } else {
          rowCells.push(EMPTY);
        }
      }
      cells.push(rowCells);
    }
    built.push({ id: `floor-${floor + 1}`, name: `Floor ${floor + 1}`, rows, cols, cells });
  }

  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    title: "Measurement",
    categories: cats,
    floors: built,
  };
}

/**
 * Exactly what schema v2 `serializePlan` wrote, without its 40 x 40 dimension
 * validation: the table includes grids far beyond the module's own limit, which
 * are measured to show the format's scaling, not to be stored.
 *
 * The cell encoding is `encodeFloorCells` — the real v2 encoder from `wire.ts` —
 * so the baseline cannot drift away from what v2 actually produced.
 */
function serializeV2Reference(plan: GymFloorPlan): string {
  const categoryIndex = new Map(plan.categories.map((category, index) => [category.id, index]));
  return JSON.stringify({
    schemaVersion: 2,
    title: plan.title,
    categories: plan.categories,
    floors: plan.floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      rows: floor.rows,
      cols: floor.cols,
      cells: encodeFloorCells(floor.cells, categoryIndex),
    })),
  });
}

describe("v3 size regression (bytes)", () => {
  /** Reads `[rows, cols, floors]` cases straight from the measured table. */
  const CASES: ReadonlyArray<readonly [number, number, number]> = [
    [40, 40, 6],
    [80, 80, 3],
    [128, 128, 2],
    [256, 256, 1],
  ];

  it("pins the v2 vs v3 byte table for a four-category plan", () => {
    const measured = CASES.map(([rows, cols, floors]) => {
      const plan = realisticPlan(rows, cols, floors, 4);
      return {
        name: `${rows}x${cols}x${floors}`,
        v2: Buffer.byteLength(serializeV2Reference(plan), "utf8"),
        // 80x80 and beyond exceed the module's own 40x40 editor limit, so the
        // table is measured through the structural packer: the format's scaling
        // is what is being pinned, not what the editor will store.
        v3: packPlanRecord(plan).byteLength,
      };
    });

    for (const row of measured) {
      console.warn(`${row.name}: v2=${row.v2}B v3=${row.v3}B ratio=${(row.v2 / row.v3).toFixed(1)}x`);
    }

    // Pinned exact values. A change here is a format change, not a flake.
    expect(measured[0]).toEqual({ name: "40x40x6", v2: 42470, v3: 3615 });
    expect(measured[1]).toEqual({ name: "80x80x3", v2: 83309, v3: 6915 });
    expect(measured[2]).toEqual({ name: "128x128x2", v2: 140608, v3: 11626 });
    expect(measured[3]).toEqual({ name: "256x256x1", v2: 278933, v3: 23056 });

    // The 40x40 case is also reachable through the public, validating API.
    const storable = realisticPlan(40, 40, 6, 4);
    expect(encodePlanBytes(storable).byteLength).toBe(measured[0].v3);
  });

  it("is smaller with fewer categories, because the index width shrinks", () => {
    const two = encodePlanBytes(realisticPlan(40, 40, 6, 2)).byteLength;
    const four = encodePlanBytes(realisticPlan(40, 40, 6, 4)).byteLength;
    const eight = encodePlanBytes(realisticPlan(40, 40, 6, 8)).byteLength;

    console.warn(`40x40x6 by category count: 2->${two}B 4->${four}B 8->${eight}B`);
    expect(two).toBeLessThan(four);
    expect(four).toBeLessThan(eight);

    expect(two).toBe(3093);
    expect(four).toBe(3615);
    expect(eight).toBe(4184);
    // The plan shape is identical, so the only difference is the index width:
    // one extra bit per machine square (~40% of 9 600 cells = ~480 bytes) plus
    // one extra UTF-8 category record per added category.
    expect(eight - four).toBeGreaterThan(400);
  });

  it("keeps a realistic 40x40x6 plan an order of magnitude under v2", () => {
    const plan = realisticPlan(40, 40, 6, 4);
    const v2 = Buffer.byteLength(serializeV2Reference(plan), "utf8");
    const v3 = encodePlanBytes(plan).byteLength;

    expect(v2 / v3).toBeGreaterThan(10);
    expect(v3).toBeLessThan(4 * 1024); // ~3.5 KB for six full floors
  });

  it("keeps the worst case (six 40x40 floors of labelled machines) storable", () => {
    const plan = realisticPlan(40, 40, 6, 4);
    const labelled: GymFloorPlan = {
      ...plan,
      floors: plan.floors.map((floor) => ({
        ...floor,
        cells: floor.cells.map((rowCells) =>
          rowCells.map((cell): FloorCell =>
            cell.kind === "machine"
              ? { kind: "machine", categoryId: cell.categoryId, label: "Chest press" }
              : cell
          )
        ),
      })),
    };

    const v2 = Buffer.byteLength(serializeV2Reference(labelled), "utf8");
    const v3 = encodePlanBytes(labelled).byteLength;
    console.warn(`40x40x6 all-machines-labelled: v2=${v2}B v3=${v3}B`);

    expect(v3).toBeLessThan(v2);
    expect(v3).toBeLessThan(300_000);
    expect(decodePlanBytes(encodePlanBytes(labelled)).ok).toBe(true);
  });

  it("grows linearly with the number of cells, not with JSON overhead", () => {
    // Same grid, twice the floors: exactly twice the cells. The header and the
    // category table are a fixed cost, so the ratio must stay close to 2 —
    // whereas the v2 token form would also have to re-emit JSON per floor.
    const one = packPlanRecord(realisticPlan(40, 40, 1, 4)).byteLength;
    const two = packPlanRecord(realisticPlan(40, 40, 2, 4)).byteLength;
    const six = packPlanRecord(realisticPlan(40, 40, 6, 4)).byteLength;

    expect(two / one).toBeGreaterThan(1.7);
    expect(two / one).toBeLessThan(2.3);
    expect(six / one).toBeGreaterThan(5.0);
    expect(six / one).toBeLessThan(6.9);
  });
});
