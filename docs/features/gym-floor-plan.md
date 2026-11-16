# Gym floor plan — design and preparation

Status: **preparation only**. The portable module and its pure logic exist and are
tested; the NexusFit admin tab and public display are deliberately **not wired
up** yet. This document is the contract for that implementation.

- Module: [`src/modules/gym-floor-plan/`](../../src/modules/gym-floor-plan/README.md)
- Test files: `src/modules/gym-floor-plan/model.test.ts`, `render.test.ts`
- Scope: data model, pure operations, validation, serialization/migrations,
  rendering decision, accessibility, editor UX, integration and portability.

## 1. What the owner is building

A gym is not a perfect rectangle. The owner needs a floor plan made without
imagery — a grid of squares where they can:

1. pick the grid size **per floor**;
2. paint a square with a **category** (blue = Impulse machines, red = Arsenal,
   green = free weights, white = toilets, ...);
3. paint a square as **void/unavailable** (column, wall notch, storage room) in
   a fixed colour that cannot be confused with equipment;
4. switch between **multiple floors**;
5. rename, add and remove categories and floors.

The plan is data, not a picture: it must survive a theme change, print in black
and white, be readable by a colour-blind member and be portable to another
project.

## 2. Data model

The TypeScript source of truth is
[`types.ts`](../../src/modules/gym-floor-plan/types.ts). Shape:

```ts
interface GymFloorPlan {
  schemaVersion: number; // 2 (v1 plans still load: see section 8)
  title: string;
  categories: Category[]; // display order
  floors: Floor[]; // display order
}

interface Category {
  id: string; // stable slug, e.g. "cat-1"
  name: string; // "Impulse machines"
  color: string; // "#2563EB" (#RRGGBB only)
  shortLabel: string; // secondary encoding, 1–3 chars, e.g. "IM"
  pattern: "solid" | "diagonal" | "dots" | "grid" | "cross";
}

interface Floor {
  id: string; // "floor-1"
  name: string; // "Ground floor"
  rows: number; // 1–40
  cols: number; // 1–40
  cells: FloorCell[][]; // cells[row][col], row 0 at the top
}

type FloorCell =
  | { kind: "empty" }
  | { kind: "machine"; categoryId: string; label?: string }
  | { kind: "void" };
```

### 2.1 Decisions

**Dense, row-major grid (`cells[row][col]`) in memory, run-length encoded on the
wire.** The plan is inherently rectangular; irregularity is modelled by void
squares, not by missing keys. A dense array renders directly
(`cells[row][col]`), needs no key parsing, makes resize a crop/pad and keeps
validation simple. A sparse `Record<"r,c", cell>` would add key validation,
ragged data and a second representation to keep in sync.

The one real cost of a dense grid is serialization, and that is paid at the
boundary instead of in the model: schema v2 (section 8) writes each row as
run-length encoded tokens, so empty floor and void collapse to a couple of
bytes and a realistic plan is about 7× smaller than the dense v1 JSON (51× on
an empty 40 × 40 × 6 grid). The in-memory `FloorCell[][]` is unchanged.

**Row 0 is the top, column 0 is the left.** This matches reading order, CSS
Grid and the resize anchor (top-left). The UI may label rows/columns 1-based.

**Void is a cell kind, not a category.** Void has a fixed colour
(`FloorPlanTheme.voidColor`), no category entry in the legend, no owner-defined
name and no short label of its own (it renders `×`). The legend still shows one
fixed void entry so the colour is explained. Keeping void out of `categories`
means deleting a category can never delete structural data, and a category can
never accidentally paint over a wall.

**Categories are referenced by stable id.** Renaming or recolouring a category
never touches a single cell. Deleting one is the only operation that must decide
what happens to its cells, and that decision is explicit (section 5.4).

**Machine labels are optional.** A cell may carry a machine name
(`"Chest press"`) for tooltips and future public detail. The category remains
the required classification; the label is metadata, capped at 40 characters.
This leaves room for a future "one machine spans several squares" model without
forcing it now (open question Q1).

**No timestamps inside the plan.** Pure functions stay deterministic and
serialization stays diff-friendly. The host stores `updatedAt` next to the plan
if it wants one.

### 2.2 JSON example

A 3 × 5 ground floor with a void notch, three categories and one named machine.
Each row is a list of tokens (section 8): a string is one square, a
`[kind, count]` array is a run of empty (`"e"`) or void (`"v"`) squares, and
`"m:<index>"` points at the category *position* in `categories`, not its id:

```json
{
  "schemaVersion": 2,
  "title": "NexusFit floor plan",
  "categories": [
    {
      "id": "cat-1",
      "name": "Impulse machines",
      "color": "#2563EB",
      "shortLabel": "IM",
      "pattern": "solid"
    },
    {
      "id": "cat-2",
      "name": "Arsenal machines",
      "color": "#DC2626",
      "shortLabel": "AR",
      "pattern": "diagonal"
    },
    {
      "id": "cat-3",
      "name": "Toilets",
      "color": "#FFFFFF",
      "shortLabel": "WC",
      "pattern": "grid"
    }
  ],
  "floors": [
    {
      "id": "floor-1",
      "name": "Ground floor",
      "rows": 3,
      "cols": 5,
      "cells": [
        ["m:0:Chest press", "m:0", "e", "m:1", "v"],
        ["m:0", ["e", 2], "m:1", "v"],
        ["m:2", "m:2", ["e", 2], "v"]
      ]
    }
  ]
}
```

## 3. Public API and host injection

Everything is exported from
[`index.ts`](../../src/modules/gym-floor-plan/index.ts). The module imports only
from its own files — never `@/lib/db`, `@/config` or `@/types`.

### 3.1 Model functions

| Function | Behaviour |
| --- | --- |
| `createEmptyPlan(options?)` | Versioned plan with one empty floor (default 12 × 12). |
| `createFloor(input)` / `addFloor(plan, input)` | New floor; `addFloor` generates `floor-N` when the id is omitted. |
| `removeFloor(plan, id)` | Refuses to remove the last floor. |
| `renameFloor(plan, id, name)` | Trims; returns the same reference for a no-op. |
| `resizeFloor(plan, id, rows, cols)` | Top-left anchored crop/pad (section 5.5). |
| `countCellsOutsideBounds(floor, rows, cols)` | Non-empty cells a resize would discard, for the confirmation dialog. |
| `createCategory(input)` / `addCategory(plan, input)` | Normalises colour to upper-case hex, derives the short label when omitted. |
| `updateCategory(plan, id, patch)` | Rename/recolour/pattern; cells untouched. |
| `removeCategory(plan, id, reassignTo)` | `reassignTo` is required: `null` clears the squares, an id moves them (section 5.4). |
| `countCategoryUsage(plan, id, floorId?)` | Squares using a category, for the delete dialog. |
| `getCell` / `setCell` / `paintCells` | Immutable cell writes; `paintCells` is one brush stroke. |
| `validatePlan(value)` | Never throws; returns `{ valid, errors, warnings }` for `unknown` input. |
| `serializePlan(plan)` | Validates, then canonical JSON with the current schema version. |
| `deserializePlan(string)` / `parsePlanValue(value)` | Parse/migrate/validate untrusted input; returns a result object. |
| `nextId`, `deriveShortLabel`, `findFloor` | Deterministic helpers. |

Mutation functions throw `FloorPlanError` with a stable `code` for programmer/UI
mistakes (unknown id, out-of-bounds, invalid colour). Untrusted data goes through
`validatePlan` / `parsePlanValue`, which never throw.

### 3.2 Render functions

`render.ts` is pure and React-free. It returns plain values:

| Function | Output |
| --- | --- |
| `buildFloorRenderModel(plan, floorId, theme?, labels?)` | Row-major `cells`, `grid` template, `legend`, `summary`. The future React component only maps over this. |
| `getCellAppearance(...)` | Colour, contrast ink, short label, pattern, `ariaLabel`, tooltip for one square. |
| `buildLegend(...)` | Every category (including unused) + the fixed void entry, each with colour, short label, pattern and count. |
| `describeFloor(...)` | Plain-language summary used as the figure alt text. |
| `getGridTemplate(rows, cols)` | `repeat(n, minmax(0, 1fr))` + `aspect-ratio`. |
| `getInkColor(hex)` | WCAG relative-luminance choice between black and white. |
| `patternToBackground(pattern, ink)` | CSS `background-image`/`background-size` strings. |

### 3.3 What the host injects

The module owns no storage, no theme and no language:

```ts
interface FloorPlanStorageAdapter {
  load(): Promise<string | null>; // previously serialized plan
  save(serialized: string): Promise<void>;
}

interface FloorPlanTheme {
  surfaceColor: string;
  emptyColor: string;
  gridLineColor: string;
  voidColor: string; // fixed void colour; never owner-editable
  inkColor: string;
  mutedInkColor: string;
}

interface FloorPlanLabels {
  unavailable: string;
  openFloor: string;
  equipment: string;
  row: string;
  column: string;
  noEquipment: string;
  unknownCategory: string;
}
```

- **Persistence:** a host can back the adapter with SQLite, `localStorage`, a
  file or an API call. NexusFit itself does not need the adapter: the plan lives
  inside the `gym_config` JSON blob, so it uses `parsePlanValue` /
  `serializePlan` around the existing config save (section 8).
- **Theme:** colours must be resolved to `#RRGGBB` because `getInkColor`
  computes contrast. A host that uses CSS variables resolves them before
  passing the theme. `DEFAULT_FLOOR_PLAN_THEME` and
  `PRINT_FLOOR_PLAN_THEME` are provided as starting points.
- **Labels:** English defaults; a Greek host overrides the strings without
  forking the module. The summary sentence structure stays English — if full
  Greek grammar is required, the host should compose its own summary from the
  render model (open question Q7).

## 4. Rendering: CSS Grid, not SVG or canvas

| Criterion | CSS Grid (chosen) | SVG | Canvas |
| --- | --- | --- | --- |
| Accessibility | Native DOM nodes, focus, `aria-label`, live regions | ARIA on `<rect>` works but focus/hit-testing is manual | No DOM; needs a parallel accessible representation |
| Hit testing / painting | Browser hit-testing; `data-row`/`data-col` | Manual coordinate maths or per-shape listeners | Manual coordinate maths |
| Text labels | HTML text, wrapping, contrast, fonts | `<text>` layout, no wrapping, manual truncation | Manual `fillText` and measurement |
| Responsive scaling | `1fr` tracks + `aspect-ratio`; reflows at any width | `viewBox` scales crisply | Redraw on resize; devicePixelRatio handling |
| Printing | CSS `@media print`, one floor per page; browsers may drop backgrounds, labels still print | Excellent, vector-crisp | Raster; DPR-dependent |
| 1 600 cells | Fine | Fine | Fine |
| Export | None built in | `outerHTML`/serializer gives SVG for free | `toDataURL` only |
| Implementation cost | Lowest | Medium | Highest |

**Decision: CSS Grid.** At the module limits (40 × 40 = 1 600 squares per floor)
DOM cells are cheap, and the editor is fundamentally an interactive grid: native
focus, keyboard handling, pointer hit-testing, text labels and ARIA all come for
free. The pure render model keeps the door open: if a future requirement needs
pan/zoom, a 10 000-cell floor or one-click PDF/SVG export, an SVG renderer can
consume `buildFloorRenderModel` without touching the model or validation.

Scaling and printing details for the future component:

- Container: `display: grid`, `grid-template-*` from `getGridTemplate`,
  `aspect-ratio: cols / rows`, `width: 100%`, `max-width` per floor size.
- Cells: `min-width: 0`, `min-height: 0`, `overflow: hidden`; label font
  `clamp(8px, 1.4vmin, 14px)` with `line-height: 1`.
- Print: `@media print` forces `PRINT_FLOOR_PLAN_THEME`, one floor per page,
  `break-inside: avoid`, `print-color-adjust: exact` where supported. Because
  some browsers still drop background colours, the short label and pattern are
  the print-safe encodings — never the fill alone.
- Large floors: recommend A3 for 40 × 40; the component should expose a
  `print`/`export` action later, not shrink below legibility.

## 5. Editor UX

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Floor tabs: [Ground floor] [First floor] [+]   [Save] [⋯]    │
├──────────────┬────────────────────────────────┬──────────────┤
│ Tools        │                                │ Legend       │
│ ● Brush      │        CSS Grid plan           │ ■ IM Impulse │
│ ○ Eraser     │        (scrollable)            │ ■ AR Arsenal │
│ ○ Void       │                                │ ▨ ×  Void    │
│ Category ▾   │                                │              │
│ Grid 12×12   │                                │ Warnings     │
└──────────────┴────────────────────────────────┴──────────────┘
```

### 5.2 Painting

- **Brush:** the active category; pointer-down paints, pointer-drag continues.
- **Drag-paint:** one stroke = one undo entry. Use pointer events with
  `touch-action: none` on the grid so a drag does not scroll the page. Track the
  cell from `event.target`/`document.elementFromPoint` via `data-row`/`data-col`;
  `paintCells` deduplicates repeated coordinates and ignores points that leave
  the grid between events. Pointer-up (or pointer-cancel) ends the stroke.
- **Eraser:** paints `{ kind: "empty" }`.
- **Void brush:** paints `{ kind: "void" }`; void is never a category, so it has
  its own tool rather than appearing in the category dropdown.
- **Keyboard:** the grid is one tab stop (roving tabindex). Arrow keys move the
  focused square, `Space`/`Enter` paints with the active brush, `Delete`/
  `Backspace` erases, `V` selects the void brush. A live region announces the
  active tool, floor and cell under the cursor.
- **No fill/rectangle tools in v1.** They are easy to add later; drag-paint
  covers the common case and keeps the first release small.

### 5.3 Floors

- Tabs in array order; the active floor is local UI state.
- Add floor: name, rows, cols. Defaults to the current floor's dimensions.
- Rename: inline.
- Remove: disabled for the last floor; confirmation names the floor.
- Reordering: drag the tab or move-left/right actions; array order is display
  order. (Not in the module API; the host reorders the array immutably.)

### 5.4 Category CRUD and deletion

- Add: name, colour (curated palette + custom hex), short label (auto-derived
  from the name, editable), pattern (solid/diagonal/dots/grid/cross).
- Edit: name, colour, short label, pattern. Cells are untouched because they
  reference the id.
- Delete: **never silent**. Show `countCategoryUsage(plan, id)` and require one
  of:
  - **Clear squares** → `removeCategory(plan, id, null)`; those squares become
    plain floor.
  - **Move to category** → `removeCategory(plan, id, targetId)`; machine labels
    are preserved, so splitting/merging categories does not lose data.
- The dialog defaults to "clear" but the destructive choice is explicit; the
  confirm button names the count ("Clear 14 squares").

### 5.5 Grid resize semantics

`resizeFloor(plan, floorId, rows, cols)` is **top-left anchored**:

- Cells inside the new bounds keep their exact `(row, col)`.
- Cells outside — machines and void alike — are **discarded**.
- Newly exposed squares are `{ kind: "empty" }`.
- The floor id and name are preserved; other floors are untouched.
- Same dimensions return the same plan reference (no re-render).
- The editor calls `countCellsOutsideBounds` first and shows "Shrinking will
  remove N painted squares (M machines, K void)" before confirming. Growing
  never needs a confirmation.
- There is no centre/right/bottom anchor option in v1; top-left is predictable
  and matches reading order. If owners need to extend upward, they can grow
  first, then repaint (open question Q8).

### 5.6 Save, undo and validation

- **Undo/redo:** the model is immutable, so the host keeps a stack of plan
  references (recommended 50 entries). One brush stroke, resize or category
  deletion is one entry. The module does not own history yet.
- **Save:** NexusFit's admin pattern is explicit save via
  `POST /api/admin/config`. Show a dirty indicator and block navigation while
  dirty; autosave is a product decision (open question Q9).
- **Validation panel:** `validatePlan` errors block save; warnings are advisory
  (duplicate colours, unused categories, empty floors, duplicate floor names).
- **Empty states:** no categories → "Add your first category"; no machines →
  hint that the floor is still empty.

## 6. Accessibility and colour encoding

Colour-only encoding fails for roughly 8% of men (deuteranopia/protanopia),
for monochrome printing, for low-quality projectors and for anyone reading a
photocopy. The plan therefore uses **three channels**:

1. **Colour** — the category fill (owner-defined, validated `#RRGGBB`).
2. **Short label** — 1–3 characters rendered in every machine square
   (`IM`, `AR`, `FW`, `WC`). This is the primary secondary encoding: it works in
   greyscale, in print, at small sizes and for every form of colour blindness.
   It is required by the data model and auto-derived when the owner does not
   supply one.
3. **Pattern** — `solid`, `diagonal`, `dots`, `grid`, `cross`, drawn as a CSS
   background over the fill. Optional (default `solid`), recommended for
   printing and for categories whose colours are close.

Supporting rules:

- **Contrast ink:** `getInkColor` computes WCAG relative luminance and picks
  black or white for the short label. This is why category colours are
  restricted to `#RRGGBB`.
- **Accessible legend:** every entry has a swatch, the short label, the full
  name and the square count. The void entry is always present. The legend is
  never a row of bare colour chips.
- **Duplicate warnings:** `validatePlan` warns when two categories share a
  colour or a short label, because either makes the encoding ambiguous.
- **White is a legal category** ("toilets"), so the plan must not rely on a
  white background to mean empty. Empty squares use `theme.emptyColor` plus
  grid lines; white category squares always carry the short label, a border and
  (recommended) a pattern. The print theme uses a light grey empty colour, not
  pure white.
- **Public view is one image, not 1 600 tab stops.** Render a `<figure>` with
  `role="img"` and `aria-label={model.summary}` (from `describeFloor`), plus a
  visually hidden legend list. A screen-reader user hears "Ground floor — 12 ×
  12. equipment: 14 Impulse machines, 10 Arsenal machines. 8 unavailable. 112
  open floor." That is more useful than tabbing through squares.
- **Editor is keyboard-operable** with roving tabindex, arrow-key movement,
  `aria-label` per square and a polite live region for tool/floor changes.
- **Reduced motion:** no required animation; if hover/paint transitions are
  added, gate them behind `prefers-reduced-motion`.
- **Target:** WCAG 2.2 AA for the editor and public view (open question Q10).

## 7. Validation rules and limits

`validatePlan` returns errors (block save) and warnings (advisory). It accepts
`unknown`, so it is also the deserialization guard.

### 7.1 Limits

| Limit | Value | Why |
| --- | --- | --- |
| Rows / columns | 1–40 each | 1 600 squares renders comfortably as DOM cells; keeps JSON bounded even when fully painted. Beyond this, use SVG/canvas and pan/zoom. |
| Floors | 1–6 | Realistic building; six 40 × 40 floors is ~3 KB when empty and ~59 KB when fully painted (v2). |
| Categories | 0–20 | Legend readability and distinguishable palette. |
| Plan title | 1–80 chars | Fits the admin header and config JSON. |
| Floor name | 1–40 chars | Fits a tab. |
| Category name | 1–40 chars | Fits the legend and delete dialog. |
| Short label | 1–3 chars, no whitespace | Readable inside a small square. |
| Machine label | 0–40 chars | Tooltip/public detail. |
| Colour | `#RRGGBB` only | Needed for deterministic contrast and pattern ink. |

### 7.2 Errors

- Not a JSON object; missing/non-integer/unsupported `schemaVersion`.
- Missing/empty/over-long title.
- `categories` not an array or over the limit.
- Category id invalid or duplicated; name empty/over-long; colour not
  `#RRGGBB`; short label empty/over-long/whitespace; unknown pattern.
- `floors` not an array, empty or over the limit.
- Floor id invalid or duplicated; name empty/over-long.
- Rows/columns not integers in range.
- `cells` not a two-dimensional array; row count ≠ `rows`; column count ≠ `cols`.
- Cell not an object; unknown `kind`; machine missing/unknown `categoryId`;
  machine label empty/over-long.

### 7.3 Warnings

- Two categories share a colour.
- Two categories share a short label.
- A category is unused by any machine square.
- A floor has no equipment squares.
- Two floors share a name.
- Future: a category colour is too close to the theme's empty/void colour
  (needs the resolved theme, so it belongs in the render/editor layer).

## 8. Serialization and migrations

`serializePlan` validates first, then writes **canonical JSON**: known fields
only, fixed key order, current `schemaVersion`, no `undefined`. Unknown fields
are stripped, so storage is stable and diffable. `title`, `categories` and each
floor's `id`/`name`/`rows`/`cols` are written as-is; `cells` is the only field
whose shape schema v2 changed.

### 8.1 The v2 cell format

In memory a floor is still a dense `FloorCell[][]`. On the wire each row is an
array of **tokens**, in left-to-right order:

| Token | Meaning |
| --- | --- |
| `"e"` | exactly one open-floor (empty) square |
| `"v"` | exactly one void square |
| `"m:<index>"` | one machine square of `categories[index]` |
| `"m:<index>:<label>"` | one machine square with a per-square label |
| `["e", n]` | `n` consecutive empty squares (run-length encoded) |
| `["v", n]` | `n` consecutive void squares (run-length encoded) |

A run of one is written as the bare token (`"e"`, 3 bytes) rather than
`["e", 1]` (9 bytes), so the encoder never emits a degenerate run.

Three decisions worth recording:

- **Category by index, not by id.** A token is `"m:0"`, not
  `"m:cat-1"`; the repeated ~8-byte `categoryId` string is gone from every
  painted square and the `categories` array carries each id once. The index is
  the position in `categories`, which is also display order, so it is stable for
  a given plan. Consequence: reordering or deleting a category changes the
  mapping, and a stored plan must be re-serialized by `serializePlan` rather
  than hand-edited.
- **Machines are never run-length encoded.** Their labels differ and every
  painted square is meaningful; a run token would have to carry per-cell labels
  anyway. One short token each is both smaller and simpler.
- **Runs must be exact.** A run that overflows the row, a length of `0`, a
  negative or non-integer length, a non-numeric length, an unknown token, a run
  carrying a machine kind or a machine token whose index is outside
  `categories` is reported as a validation **issue** — never thrown, never
  clamped, never silently truncated. A decoder must be able to reconstruct
  exactly the same `FloorCell[][]` it encoded.

The decoder also accepts the expanded v1-style cell objects
(`{"kind":"empty"}`, `{"kind":"machine","categoryId":"cat-1"}`) inside a v2
row. That keeps `validatePlan(plan)` valid for an in-memory plan (a host may
call it directly on a live `GymFloorPlan`), lets a tiny fixture be written by
hand, and means the encoder is the only place that must know the token grammar.

The format is implemented in `wire.ts`
([`src/modules/gym-floor-plan/wire.ts`](../../src/modules/gym-floor-plan/wire.ts)):
`encodeFloorCells`, `decodeFloorRows`, `collapseEmptyAndVoidRuns` and the
migration. `model.ts` consumes it and remains the only public entry point.

### 8.2 Measured size

Bytes of the canonical JSON string, same plans measured with the v1 dense format
and the v2 RLE format (`wire-size.test.ts` asserts these ratios so they cannot
silently regress):

| Plan | v1 (dense) | v2 (RLE) | Saving |
| --- | --- | --- | --- |
| 12 × 12, empty (default plan) | 2 703 B | 363 B | 7.4× |
| 40 × 40, all machine | 64 311 B | 9 911 B | 6.5× |
| 40 × 40 × 6, all machine | 385 031 B | 58 631 B | 6.6× |
| 40 × 40 × 6, all empty | 164 231 B | 3 191 B | 51.5× |
| 40 × 40 × 6, labelled machines (worst case) | 596 231 B | 173 831 B | 3.4× |

Reading the table: an all-machine floor is the case v2 helps least (it is one
token per painted square in both formats, minus the repeated category id),
realistic plans are mostly open floor and void and land around 7×, and the
empty/void extremes — the ones that previously dominated the `gym_config` blob —
gain more than 50×. The worst case for the module's own limits (six 40 × 40
floors, every square a labelled machine) still fits comfortably in a SQLite text
value at ~174 KB.

### 8.3 Reading, migrating, compatibility

- `deserializePlan(string)` parses, migrates and validates.
  `parsePlanValue(value)` does the same for an already-parsed value (NexusFit's
  nested `gym_config` blob).
- Both return `{ ok: true, plan, warnings }` or `{ ok: false, issues }`; they
  never throw on bad input. Both keep their original signatures.
- Both accept **v1 and v2** input. A v1 record is migrated forward, then
  expanded, so callers always receive the same in-memory `FloorCell[][]` and
  never see a token. No consumer of the module needs to know the wire format.
- `schemaVersion` is a required top-level field. A plan newer than the module is
  rejected with an actionable message (`unsupported-schema-version`); an older
  plan runs through `PLAN_MIGRATIONS` before validation.

`PLAN_MIGRATIONS[1]` is the v1 → v2 step. It converts each v1 cell object to a
token, deriving the machine's category index from the position of its
`categoryId` in the plan's own `categories` array, and collapses adjacent
`"e"`/`"v"` tokens into runs. Two failure modes are deliberate:

- **Unknown `categoryId` in a v1 plan.** Validation reports
  `unknown-category` and the plan fails to load. The migration does not drop
  the square, invent a category or fall back to empty: losing owner data
  silently is worse than refusing to load.
- **A v2 record mislabelled as `schemaVersion: 1`.** The migration rejects any
  v1 cell that is not an object, so token strings cannot masquerade as v1 cells.

The reverse direction is not supported: a v1-shaped decoder cannot read v2
output (it would see strings where it expects cell objects), which is exactly
why the version field is checked before anything else.

Future versions follow the same three-step recipe:

```ts
// 1. Bump FLOOR_PLAN_SCHEMA_VERSION.
// 2. Register a migration keyed by the version it migrates FROM.
PLAN_MIGRATIONS[2] = (raw) => ({ ...raw, schemaVersion: 3 /* ... */ });
// 3. Extend validation for the new fields.
```

There is no v0 migration: the feature is new, so an unversioned or version-0
plan is rejected with `missing-migration` rather than guessed at. If a beta
ships with a different shape, add the migration then.

`parsePlanValue` and `deserializePlan` accept an optional migration table
(second argument). Hosts normally omit it and use the module's own table; the
parameter exists so the migration loop is testable and so a host with a custom
schema lineage can supply its own. If a host supplies a table it must still
include the `1` entry, or v1 records stop loading.

## 9. Integration plan for NexusFit

The module is ready; the following steps touch existing files and are therefore
**separate tasks** from this preparation.

### Phase 1 — type and default config

- Add `floorPlan?: GymFloorPlan` to `GymConfig` (`src/types/index.ts`). Optional
  so existing stored configs keep working; absent means "no plan yet".
- Add a sample plan to `src/config/gymConfig.ts` (optional, for the demo and
  first-run experience). The browser demo under `site/` imports
  `defaultGymConfig`, so it flows through automatically.
- No API route change: `POST /api/admin/config` already persists the whole
  config JSON blob. `parsePlanValue` validates on read, `serializePlan` on
  write.

### Phase 2 — admin tab

- New `src/components/admin/FloorPlanTab.tsx` following the existing
  `config` / `setConfig` contract.
- New `src/components/floor-plan/FloorPlanEditor.tsx` (client component) that
  consumes `buildFloorRenderModel` and calls the model functions. Keep it
  presentational: no direct `fetch`, no SQLite, no `@/lib` imports.
- Register the tab in `src/app/admin/page.tsx` (existing file edit).
- Load: `parsePlanValue(config.floorPlan)`; if absent, `createEmptyPlan()`.
- Save: `serializePlan(plan)` → parse back into the config object (or store the
  plan object directly and let the API serialize the blob). Errors block save;
  warnings show in the panel.
- Theme: map the CSS variables (`--surface-rgb`, `--ink-rgb`, ...) to hex in a
  small adapter, or keep a static theme map per `data-theme`. The module needs
  resolved hex for contrast.
- Labels: Greek strings via `FloorPlanLabels`.

### Phase 3 — public display

- New `src/components/GymFloorPlan.tsx` — **distinct from the existing
  `GymMap.tsx`**, which is the OpenStreetMap location embed.
- Floor tabs + `buildFloorRenderModel` + `<figure role="img">` + visible legend
  (swatch, short label, name, count) + hidden summary for screen readers.
- Place it on the facilities page or a new `/floor-plan` route (new page). The
  public view is read-only: no editor state, no category management.
- Greek labels; print stylesheet using `PRINT_FLOOR_PLAN_THEME`.

### Phase 4 — verification and docs

- Add the two new test files to the README testing section and the module to the
  README module map if desired. `npm run check:docs` currently emits soft
  warnings for undocumented test files; CI does not fail on warnings, but
  `--strict` does, so document them when the integration task lands.
- Component tests need a per-file `// @vitest-environment jsdom` docblock
  because the global Vitest environment is `node`.
- Re-run the gate: `npx tsc --noEmit --incremental false`, `npx vitest run`,
  `npm run lint`, `npm run check:docs`, `npm run build`, `npm run demo:build`.

### Persistence and performance notes

- No new SQLite table and no migration: the plan rides in `gym_config`, so
  tenant isolation, backup and restore already cover it.
- Size: a default 12 × 12 empty plan is ~360 B and a realistic sparse plan
  under 1 KB (schema v2 RLE); the worst case (6 × 40 × 40, every square a
  labelled machine) is ~174 KB, and 6 × 40 × 40 empty is ~3 KB. Check the config
  POST body limit only if the maximum grid is expected to be densely painted.
- Rendering: `setCell` copies only the changed row, so a React editor can memo
  row components by row-array reference; a paint stroke re-renders one row, not
  the whole floor. Measure with React DevTools before optimizing further.
- Security: the plan is owner-authored data rendered as text and CSS colours.
  React escapes names/labels; validation rejects unknown fields and sizes.
  There is no HTML injection surface.

## 10. Portability plan

The module is designed to be copied, not imported across projects:

1. Copy `src/modules/gym-floor-plan/` (types, model, render, index, tests,
   README).
2. Keep the relative imports; do not add `@/` imports.
3. Choose persistence:
   - JSON string (localStorage/file/API): implement `FloorPlanStorageAdapter`
     with `serializePlan` / `deserializePlan`.
   - Nested JSON blob: use `parsePlanValue` / `serializePlan` like NexusFit.
4. Pass a `FloorPlanTheme` resolved to hex and a `FloorPlanLabels` object for
   the host language.
5. Write a thin UI wrapper (React, Vue, Svelte or plain DOM) that consumes
   `buildFloorRenderModel`. The model and render helpers are framework-free.
6. Keep `schemaVersion` and ship the migration table with the module; never
   edit stored plans in place without a migration.

What to replace in a port: theme colours, labels, the persistence adapter and
the UI wrapper. What to keep: `types.ts`, `model.ts`, `render.ts`, the tests and
the schema version. The JSON shape is the integration contract if the host is
not TypeScript.

License note: NexusFit is AGPL-3.0-only; copying the module into another project
is subject to that license.

## 11. Open questions for the product owner

These need answers before the admin/public implementation starts; the current
module has a defensible default for each.

1. **One square = one machine?** Or can a machine/zone span several squares
   (e.g. a free-weights area covering 6 squares)? The current model is one
   category per square; spanning needs a merge/group model.
2. **Machine names:** is the optional per-square label enough, or does the
   public plan need a searchable machine list with photos?
3. **White toilets vs empty floor:** confirm white is required (it is legal in
   the model, with label + border + pattern). If not, an off-white or a
   dedicated pattern avoids the ambiguity entirely.
4. **Real maximum grid:** is 40 × 40 per floor enough for the largest floor?
   What print size is expected (A4/A3/A2)?
5. **Floor semantics:** do floors need levels (basement/mezzanine), custom
   ordering beyond array order, or a "hide from public" flag?
6. **Public exposure:** should members see the exact machine layout, or only
   zones/categories? Any concern about publishing the layout?
7. **Localisation:** the module ships English labels and an English summary
   sentence. Does the public page need fully grammatical Greek (host-composed
   summary) or are translated labels enough?
8. **Resize anchor:** is top-left always right, or do owners need to extend a
   floor upward/leftward (which would need a different anchor and a warning)?
9. **Save/undo:** explicit Save with a dirty guard, or autosave? How many undo
   steps?
10. **Accessibility target:** is WCAG 2.2 AA plus the summary/legend approach
    enough, or is a full accessible table alternative required?
11. **Export/print:** is a print/PDF/SVG export part of the first release?
    (The render model makes an SVG renderer feasible, but it is extra work.)
12. **Colour selection:** free colour picker, curated accessible palette, or
    both with warnings? (Recommendation: curated palette + custom with the
    duplicate/contrast warnings.)

## 12. Verification for this preparation

Run from the repository root:

```bash
npx tsc --noEmit --incremental false   # clean
npx vitest run                         # 28 files / 310 tests (77 new)
npm run lint                           # 0 errors, 70 warnings (baseline)
```

`git status --porcelain` must show only additions (`??`) — no existing file is
modified by this preparation.
