# Gym floor plan (portable module)

A self-contained data model, pure logic and pure render model for a gym floor
plan built from a grid of squares — no imagery, no map provider, no database.

- Multiple floors, each with its own grid size.
- Owner-defined colour categories (blue = Impulse, red = Arsenal, green = free
  weights, white = toilets, ...).
- A fixed **void** square kind for walls, columns and storage rooms.
- Per-square optional machine labels.
- Two versioned wire forms (schema v3): canonical JSON with run-length encoded
  cells **and** a packed binary payload that stores one cell in ~2-4 bits, plus
  a v1 -> v2 -> v3 migration chain, so a 40 x 40 x 6 plan costs ~3.6 KB instead
  of ~42 KB.
- Three-channel encoding (colour + short label + pattern) and WCAG-contrast
  label ink, so the plan is not colour-only.
- No imports from the host app: persistence, theme and language are injected.

This directory is the whole module. Copy it into another project as-is.

## Files

| File | Purpose |
| --- | --- |
| `types.ts` | Data model, limits, host contracts (`FloorPlanStorageAdapter`, `FloorPlanTheme`, `FloorPlanLabels`), render types. |
| `model.ts` | Pure operations: create, resize, category CRUD, cell painting, validation, serialization and migrations. |
| `wire.ts` | Schema v2 text wire format: run-length encoding, token decoding and the v1 -> v2 migration. |
| `wireBinary.ts` | Schema v3 packed binary format: header, bit-packed grid, label side table, v2 -> v3 migration. |
| `render.ts` | Pure presentation model: CSS Grid template, contrast ink, patterns, legend, screen-reader summary. |
| `index.ts` | Public barrel export. Import from here. |
| `model.test.ts` | 59 unit tests for every model function and edge case. |
| `wire.test.ts` | 46 unit tests for the v2 token format, run boundaries, category indexes, the v1 migration and malformed RLE. |
| `wireBinary.test.ts` | 43 unit tests for the v3 binary format: header, bit packing, label side table, hostile input, migrations and the size table. |
| `wire-size.test.ts` | 6 measured byte-size regressions: v1 dense JSON vs v2 RLE. |
| `render.test.ts` | 18 unit tests for the render model and accessibility helpers. |
| `README.md` | This file. |

Design document:
[`docs/features/gym-floor-plan.md`](../../../docs/features/gym-floor-plan.md).

## Quick start

```ts
import {
  addCategory,
  addFloor,
  buildFloorRenderModel,
  createEmptyPlan,
  serializePlan,
  setCell,
} from "@/modules/gym-floor-plan";

let plan = createEmptyPlan({ rows: 12, cols: 12, title: "NexusFit" });

plan = addCategory(plan, {
  name: "Impulse machines",
  color: "#2563EB",
  // shortLabel is derived ("IM") when omitted; pattern defaults to "solid".
});

plan = addFloor(plan, { name: "First floor", rows: 10, cols: 12 });

plan = setCell(plan, "floor-1", 0, 0, {
  kind: "machine",
  categoryId: "cat-1",
  label: "Chest press",
});
plan = setCell(plan, "floor-1", 0, 1, { kind: "void" });

const json = serializePlan(plan); // canonical, versioned
const model = buildFloorRenderModel(plan, "floor-1");
// model.cells -> row-major cells with colour, shortLabel, pattern, ariaLabel
// model.grid  -> CSS Grid template
// model.legend, model.summary
```

## Data model

```ts
type FloorCell =
  | { kind: "empty" }
  | { kind: "machine"; categoryId: string; label?: string }
  | { kind: "void" };

interface Category {
  id: string; // "cat-1"
  name: string;
  color: string; // "#2563EB"
  shortLabel: string; // 1–3 chars, e.g. "IM"
  pattern: "solid" | "diagonal" | "dots" | "grid" | "cross";
}

interface Floor {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cells: FloorCell[][]; // cells[row][col], row 0 at the top
}

interface GymFloorPlan {
  schemaVersion: number; // 2
  title: string;
  categories: Category[];
  floors: Floor[];
}
```

The in-memory shape above is unchanged from schema v1. Only the **serialized**
`cells` differ: see [Serialization and migrations](#serialization-and-migrations).

Array order is display order for floors and categories. Void is a cell kind, not
a category: it has a fixed theme colour and cannot be reassigned or deleted with
a category.

## API

Model (`model.ts`):

- `createEmptyPlan`, `createFloor`, `addFloor`, `removeFloor`, `renameFloor`
- `resizeFloor`, `countCellsOutsideBounds`
- `createCategory`, `addCategory`, `updateCategory`, `removeCategory`,
  `countCategoryUsage`
- `getCell`, `setCell`, `paintCells`
- `validatePlan`, `serializePlan`, `deserializePlan`, `parsePlanValue`
- `nextId`, `deriveShortLabel`, `findFloor`
- `FloorPlanError` with a stable `code`

Render (`render.ts`):

- `buildFloorRenderModel`, `getCellAppearance`, `buildLegend`, `describeFloor`
- `getGridTemplate`, `getInkColor`, `patternToBackground`
- `DEFAULT_FLOOR_PLAN_THEME`, `PRINT_FLOOR_PLAN_THEME`,
  `DEFAULT_FLOOR_PLAN_LABELS`

Mutation functions return a new plan and never mutate the input. They throw
`FloorPlanError` for programmer/UI mistakes. Untrusted input goes through
`validatePlan` / `parsePlanValue`, which return issues instead of throwing.

## Host injection

The module knows nothing about SQLite, `localStorage`, Tailwind or `@/config`.

```ts
import type {
  FloorPlanLabels,
  FloorPlanStorageAdapter,
  FloorPlanTheme,
} from "@/modules/gym-floor-plan";

const storage: FloorPlanStorageAdapter = {
  load: async () => localStorage.getItem("gym-floor-plan"),
  save: async (serialized) => localStorage.setItem("gym-floor-plan", serialized),
};

const theme: FloorPlanTheme = {
  surfaceColor: "#111827",
  emptyColor: "#1F2937",
  gridLineColor: "#374151",
  voidColor: "#4B5563", // fixed void colour
  inkColor: "#F9FAFB",
  mutedInkColor: "#9CA3AF",
};

const labels: FloorPlanLabels = {
  unavailable: "μη διαθέσιμο",
  openFloor: "ελεύθερος χώρος",
  equipment: "εξοπλισμός",
  row: "Σειρά",
  column: "στήλη",
  noEquipment: "χωρίς εξοπλισμό",
  unknownCategory: "άγνωστη κατηγορία",
};
```

Theme colours must be resolved to `#RRGGBB` so `getInkColor` can guarantee
label contrast. A host that keeps its palette in CSS variables should resolve
them before passing the theme.

## Semantics worth knowing

- **Resize is top-left anchored.** Cells inside the new bounds keep their
  position; machines and void outside are discarded; new squares are empty.
  Call `countCellsOutsideBounds` first and confirm when it is non-zero.
- **Deleting a category requires a decision.** `removeCategory(plan, id, null)`
  clears its squares; `removeCategory(plan, id, targetId)` moves them and keeps
  their machine labels. There is no silent default.
- **Paint strokes ignore out-of-bounds points.** `paintCells` deduplicates
  coordinates and drops points outside the floor, so a pointer drag that leaves
  the grid does not throw.
- **No-ops return the same reference.** `setCell` on an unchanged cell,
  `resizeFloor` to the same size and `updateCategory` with no changes return the
  input plan, which keeps React re-renders cheap.

## Validation and limits

`validatePlan(value: unknown)` returns `{ valid, errors, warnings }` and never
throws. Errors block saving; warnings are advisory.

Limits: 1–40 rows and columns, 1–6 floors, 0–20 categories, plan title ≤80
characters, floor/category names ≤40, short label 1–3 characters, machine label
≤40, colour `#RRGGBB`.

Warnings: duplicate category colour, duplicate short label, unused category,
floor with no equipment, duplicate floor name.

## Serialization and migrations

The module owns **two wire forms**, and both validate through the same
`validatePlan` / `parsePlanValue` path, so they accept and reject exactly the
same plans:

| Form | API | Used for |
| --- | --- | --- |
| Text (JSON) | `serializePlan` / `deserializePlan` / `parsePlanValue` | Canonical, diffable JSON. What a `TEXT` column or a config blob holds. |
| Binary (packed) | `encodePlanBytes` / `decodePlanBytes` | The storage payload: a 24-byte header + a bit-packed grid. What a `BLOB` column holds. |

```ts
import { decodePlanBytes, encodePlanBytes } from "@/modules/gym-floor-plan";

const bytes: Uint8Array = encodePlanBytes(plan); // throws FloorPlanError("invalid-plan")
const result = decodePlanBytes(bytes); // never throws
if (result.ok) {
  console.log(result.plan.floors.length, result.warnings);
} else {
  console.error(result.issues); // [{ severity, code, message, path? }, ...]
}
```

`encodePlanBytes(plan: GymFloorPlan): Uint8Array` validates first and throws
`FloorPlanError` with code `invalid-plan` on an invalid plan, exactly like
`serializePlan`. `decodePlanBytes(bytes: Uint8Array | ArrayBuffer):
DeserializeResult` returns `{ ok: true, plan, warnings }` or
`{ ok: false, issues }` — the same shape as `parsePlanValue` — and never throws.

`parsePlanValue` is the right entry point when the plan is nested inside a
larger JSON blob (for example NexusFit's `gym_config`).

### Schema v2: run-length encoded cells (the JSON form)

`title`, `categories`, `floors[].id/name/rows/cols` and `schemaVersion` are
written as-is. `cells` is a per-row array of **tokens**:

| Token | Meaning |
| --- | --- |
| `"e"` | exactly one empty square |
| `"v"` | exactly one void square |
| `"m:<index>"` | one machine square of `categories[index]` |
| `"m:<index>:<text>"` | one machine square with a per-square label |
| `["e", n]` | `n` consecutive empty squares |
| `["v", n]` | `n` consecutive void squares |

A 12 × 12 default plan serializes its first row as `[["e", 12]]` instead of
twelve `{"kind":"empty"}` objects.

Three decisions matter for anyone reading a stored plan:

- **Categories are referenced by index, not by id.** The token says `m:0`, not
  `m:cat-1`; the `categories` array carries the ids once. The index is the
  position in `categories`, which is also display order. Reordering categories
  therefore changes the tokens — re-serialize after reordering, and never edit
  a stored plan by hand without re-running `serializePlan`.
- **Only empty and void are run-length encoded.** Machine squares stay one
  token each because their labels differ and each one is meaningful. A run of
  one is written as the bare token (`"e"`, 3 bytes) rather than `["e", 1]`
  (9 bytes).
- **Runs are exact.** A run that would overflow the row, a run of `0`, a
  negative or non-integer length, an unknown token or a machine token whose
  index is out of range is a validation **issue**, never an exception and never
  a silently clamped grid. `decodeFloorRows` also accepts the expanded cell
  object form, so a plan produced in memory is still valid input.

Decoding is invisible to callers: `deserializePlan` / `parsePlanValue` return
the same `FloorCell[][]` they always did. The text format lives in `wire.ts`.

### Schema v3: the packed binary payload

Text spends bytes on punctuation, not information: `"m:0"` is five bytes to say
"machine, category 0" — two bits of meaning. The binary form packs the grid.

**Layout.** All integers big-endian; "varint" is unsigned LEB128.

Header, 24 bytes at offset 0:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 2 | magic `"NF"` (`0x4E 0x46`) |
| 2 | 1 | payload version (3) |
| 3 | 1 | flags: bit0 `HAS_LABELS`, rest reserved |
| 4 | 1 | floor count (1–6) |
| 5 | 1 | category index bit width (1–5) |
| 6 | 2 | max rows (1–40) |
| 8 | 2 | max cols (1–40) |
| 10 | 2 | category count |
| 12 | 2 | label count |
| 14 | 4 | total payload length, header included |
| 18 | 4 | FNV-1a 32-bit checksum of the body |
| 22 | 2 | reserved, must be 0 |

Body, from offset 24:

```
title                varint len + UTF-8
categoryCount times: varint+bytes id, varint+bytes name, 3 bytes RGB,
                     varint+bytes shortLabel, 1 byte pattern index
floorCount times:    varint+bytes id, varint+bytes name,
                     uint16 rows, uint16 cols,
                     varint gridByteLength, grid bytes
labelCount times:    varint cellOrdinal, varint len, UTF-8 label
```

**Grid.** Row-major, most-significant-bit first. Every cell starts with 2 kind
bits (`0` empty, `1` void, `2` machine, `3` reserved/invalid). A **machine cell
is immediately followed by the category index, `categoryBits` wide**; empty and
void cells carry no index. That is the win: an empty square costs exactly two
bits. The width is `ceil(log2(max(2, categoryCount)))`, chosen once per plan and
recorded in the header (1 bit for 0–2 categories, 2 for 3–4, 3 for 5–8, up to 5
for 20). Each grid is padded to a byte boundary with zero bits, which the decoder
requires to be zero.

**Labels are a side table**, so a plan with no labels pays **zero** label bytes
(no count prefix, no per-cell flag). A label costs `1 + 1 + utf8Length` bytes:
a flat `cellOrdinal` varint (`floorOffset + row * cols + col`), a length varint
and the UTF-8 bytes. Ordinals are strictly ascending.

**Integrity.** Magic + version reject a mis-fed blob by name; the declared total
length rejects truncation and trailing garbage *before* any per-floor
allocation; an FNV-1a checksum turns a flipped cell bit into an
`invalid-binary-checksum` issue instead of a silently different gym. The
per-floor `gridByteLength` is bounds-checked against the all-machine maximum
before allocating, and a non-zero padding bit is an issue rather than a desync.

`decodePlanBytes` accepts **only the current binary version**. v1 and v2 plans
are JSON, so they go through `deserializePlan` / `parsePlanValue`.

### Measured size

Same deterministic fixture (seeded, ~40% machines, ~8% void, 4 categories),
pinned by `wireBinary.test.ts`:

| Plan | v2 (JSON tokens) | v3 (binary) | Ratio |
| --- | --- | --- | --- |
| 40 × 40 × 6 | 42 470 B | **3 615 B** | 11.7× |
| 80 × 80 × 3 | 83 309 B | 6 915 B | 12.0× |
| 128 × 128 × 2 | 140 608 B | 11 626 B | 12.1× |
| 256 × 256 × 1 | 278 933 B | 23 056 B | 12.1× |

The category count moves the ratio because it moves the index width (same
40 × 40 × 6 plan):

| Categories | Index bits | v2 | v3 | Ratio |
| --- | --- | --- | --- | --- |
| 2 | 1 | 42 296 B | 3 093 B | 13.7× |
| 4 | 2 | 42 470 B | 3 615 B | 11.7× |
| 8 | 3 | 42 824 B | 4 184 B | 10.2× |

The v1 dense form of the same 40 × 40 × 6 plan is 164 231 B all-empty and
385 031 B all-machine, so v3 is roughly 40–100× smaller than v1 on realistic
plans. `wire-size.test.ts` pins the text-vs-v1 ratios; `wireBinary.test.ts` pins
the binary numbers above.

### Migrations

`PLAN_MIGRATIONS` is keyed by the version each entry migrates **from**.

- `PLAN_MIGRATIONS[1]` converts a v1 record (`cells` as cell objects) into v2
  token rows, deriving each machine's category index from its v1 `categoryId`.
- `PLAN_MIGRATIONS[2]` converts a v2 record into canonical v3 form. v3 does not
  change the text grammar, so this step decodes each floor's rows (tokens, runs
  *and* expanded cell objects are all accepted) and re-encodes them with the
  canonical v2 encoder. A migrated v2 record is byte-for-byte what
  `serializePlan` would have written, so it packs to binary without a second
  pass.

A v1 plan whose cell references a `categoryId` that is not in `categories` is
passed through unconverted and then **rejected** by validation with
`unknown-category`. A floor whose rows do not decode is passed through for the
decoder to report (`invalid-cells`, `unknown-category`). That is deliberate:
silently dropping or reassigning the square would lose owner data. A v2 record
mislabelled as `schemaVersion: 1` is rejected too, because v1 cells are objects
and a token string is not.

To add a future schema version: bump `FLOOR_PLAN_SCHEMA_VERSION`, register a
migration in `PLAN_MIGRATIONS` under the previous version, and extend
validation. Older stored plans then migrate on read; newer plans are rejected
with an actionable message. `parsePlanValue` / `deserializePlan` accept an
optional migration table as a second argument (tests use it; hosts normally
omit it, but a custom table must still contain the `1` and `2` entries).

## Rendering and accessibility

The module returns a pure render model; the UI wrapper is intentionally not
included here. CSS Grid is the recommended renderer: native focus and hit
testing, responsive square cells via `minmax(0, 1fr)` + `aspect-ratio`, and
printable labels. An SVG renderer can consume the same model later for export.

Colour is never the only channel:

- every machine square carries its category's 1–3 character short label;
- a pattern (diagonal/dots/grid/cross) can be layered over the fill;
- the legend lists swatch + short label + name + count, plus the fixed void
  entry;
- label ink is black or white by WCAG relative luminance;
- the public figure uses `describeFloor` as its alt text instead of exposing
  hundreds of focusable squares.

## Porting checklist

1. Copy this directory.
2. Keep the relative imports; do not add `@/` imports.
3. Implement `FloorPlanStorageAdapter`, or call `encodePlanBytes` /
   `decodePlanBytes` (binary storage) or `serializePlan` / `deserializePlan`
   (text storage) directly.
4. Provide a hex `FloorPlanTheme` and a translated `FloorPlanLabels`.
5. Write a thin UI wrapper over `buildFloorRenderModel`.
6. Keep `schemaVersion`, `wire.ts` and `wireBinary.ts`, and ship the migrations
   with the module. A host that stores bytes only needs `encodePlanBytes` /
   `decodePlanBytes`; one that stores text only needs `serializePlan` /
   `deserializePlan`. Neither ever has to understand the token or bit layout.

## Tests

```bash
npx vitest run src/modules/gym-floor-plan
```

172 tests: model creation, floor/category CRUD, resize preservation and
discarding, category deletion with clear/reassign, painting, validation, the v2
run-length text format (round-trip, run boundaries, category indexes, v1
migration, malformed RLE), the v3 packed binary format (header, bit packing,
label side table, hostile/truncated/tampered payloads, v1 -> v2 -> v3
migrations), measured byte savings for both forms, render model, contrast and
accessibility.
