# Gym floor plan (portable module)

A self-contained data model, pure logic and pure render model for a gym floor
plan built from a grid of squares — no imagery, no map provider, no database.

- Multiple floors, each with its own grid size.
- Owner-defined colour categories (blue = Impulse, red = Arsenal, green = free
  weights, white = toilets, ...).
- A fixed **void** square kind for walls, columns and storage rooms.
- Per-square optional machine labels.
- Versioned JSON (schema v2) with run-length encoded cells and a v1 -> v2
  migration, so a mostly-empty plan costs kilobytes rather than hundreds of
  kilobytes.
- Three-channel encoding (colour + short label + pattern) and WCAG-contrast
  label ink, so the plan is not colour-only.
- No imports from the host app: persistence, theme and language are injected.

This directory is the whole module. Copy it into another project as-is.

## Files

| File | Purpose |
| --- | --- |
| `types.ts` | Data model, limits, host contracts (`FloorPlanStorageAdapter`, `FloorPlanTheme`, `FloorPlanLabels`), render types. |
| `model.ts` | Pure operations: create, resize, category CRUD, cell painting, validation, serialization and migrations. |
| `wire.ts` | Schema v2 wire format: run-length encoding, token decoding and the v1 -> v2 migration. |
| `render.ts` | Pure presentation model: CSS Grid template, contrast ink, patterns, legend, screen-reader summary. |
| `index.ts` | Public barrel export. Import from here. |
| `model.test.ts` | 59 unit tests for every model function and edge case. |
| `wire.test.ts` | 46 unit tests for the v2 token format, run boundaries, category indexes, the v1 migration and malformed RLE. |
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

`serializePlan` validates and writes canonical JSON (known fields only, fixed key
order, current `schemaVersion`). `deserializePlan(string)` and
`parsePlanValue(value)` parse, migrate and validate, returning
`{ ok: true, plan, warnings }` or `{ ok: false, issues }`.

`parsePlanValue` is the right entry point when the plan is nested inside a
larger JSON blob (for example NexusFit's `gym_config`).

### Schema v2: run-length encoded cells

`title`, `categories`, `floors[].id/name/rows/cols` and `schemaVersion` are
written exactly as before. Only `cells` changed: instead of one object per
square, each row is an array of **tokens**.

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
the same `FloorCell[][]` they always did. The wire format lives in `wire.ts`.

Measured on the same plans (bytes of the canonical JSON string):

| Plan | v1 (dense objects) | v2 (RLE tokens) | Saving |
| --- | --- | --- | --- |
| 12 × 12, empty | 2 703 | 363 | 7.4× |
| 40 × 40, all machine | 64 311 | 9 911 | 6.5× |
| 40 × 40 × 6, all machine | 385 031 | 58 631 | 6.6× |
| **40 × 40 × 6, all empty** | **164 231** | **3 191** | **51.5×** |
| 40 × 40 × 6, labelled machine (worst case) | 596 231 | 173 831 | 3.4× |

An all-machine floor gains the least (one token per painted square either way,
minus the repeated category id); realistic plans, which are mostly open floor
and void, gain about 7×, and the empty-heavy extremes gain more than 50×.
`wire-size.test.ts` asserts these ratios so a future change cannot quietly
regress them.

### Migrations

`PLAN_MIGRATIONS` is keyed by the version each entry migrates **from**.
`PLAN_MIGRATIONS[1]` converts a v1 record (`cells` as cell objects) into v2
token rows, deriving each machine's category index from its v1 `categoryId`.

A v1 plan whose cell references a `categoryId` that is not in `categories` is
passed through unconverted and then **rejected** by validation with
`unknown-category`. That is deliberate: silently dropping or reassigning the
square would lose owner data. A v2 record mislabelled as `schemaVersion: 1` is
rejected too, because v1 cells are objects and a token string is not.

To add a future schema version: bump `FLOOR_PLAN_SCHEMA_VERSION`, register a
migration in `PLAN_MIGRATIONS` under the previous version, and extend
validation. Older stored plans then migrate on read; newer plans are rejected
with an actionable message. `parsePlanValue` / `deserializePlan` accept an
optional migration table as a second argument (tests use it; hosts normally
omit it).

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
3. Implement `FloorPlanStorageAdapter`, or call `serializePlan` /
   `deserializePlan` directly.
4. Provide a hex `FloorPlanTheme` and a translated `FloorPlanLabels`.
5. Write a thin UI wrapper over `buildFloorRenderModel`.
6. Keep `schemaVersion` and `wire.ts`, and ship the migrations with the module.
   A host that stores the JSON string only needs `serializePlan` /
   `deserializePlan`; it never has to understand the token format.

## Tests

```bash
npx vitest run src/modules/gym-floor-plan
```

129 tests: model creation, floor/category CRUD, resize preservation and
discarding, category deletion with clear/reassign, painting, validation, the v2
run-length wire format (round-trip, run boundaries, category indexes, v1
migration, malformed RLE), measured byte savings, render model, contrast and
accessibility.
