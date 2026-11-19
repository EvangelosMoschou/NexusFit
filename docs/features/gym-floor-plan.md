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
  schemaVersion: number; // 3 (v1 and v2 plans still load: see section 8)
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
  rows: number; // 1–96
  cols: number; // 1–96
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
an empty 40 × 40 × 6 grid, and 51× at the 96 × 96 ceiling). The in-memory
`FloorCell[][]` is unchanged.

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
  "schemaVersion": 3,
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
| `encodePlanBytes(plan)` | Validates, then the packed schema v3 binary payload (`Uint8Array`). Throws `FloorPlanError("invalid-plan")`. |
| `decodePlanBytes(bytes)` | Reads a packed binary payload (`Uint8Array` or `ArrayBuffer`); never throws, accepts only the current binary version. |
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
| 1 600 cells (40 × 40) | Fine | Fine | Fine |
| 9 216 cells (96 × 96) | Poor: 9 216 DOM nodes, ~9 216 objects in the render model | Fine | Fine |
| Export | None built in | `outerHTML`/serializer gives SVG for free | `toDataURL` only |
| Implementation cost | Lowest | Medium | Highest |

**Decision: CSS Grid at 40 × 40; SVG above it.** Up to 1 600 squares per floor
DOM cells are cheap, and the editor is fundamentally an interactive grid: native
focus, keyboard handling, pointer hit-testing, text labels and ARIA all come for
free. At the 96 × 96 ceiling that argument stops holding — 9 216 DOM nodes per
floor is not a grid anyone wants to hit-test — so the renderer moves to SVG
(one `<rect>` per appearance group, or run-merged rects) while the *model* stays
identical. This is why the render model was packed (section 4.1): the renderer
choice is now a presentation detail, not a limit on the plan size.

Scaling and printing details for the future component:

- Container: a CSS Grid with `grid-template-columns: repeat(cols, minmax(0, 1fr))`
  and `aspect-ratio: cols / rows` was what the CSS-Grid path used; the SVG path
  uses `viewBox="0 0 cols rows"` with `preserveAspectRatio` instead, which keeps
  squares square at any width.
- Cells: `min-width: 0`, `min-height: 0`, `overflow: hidden`; label font
  `clamp(8px, 1.4vmin, 14px)` with `line-height: 1`.
- Print: `@media print` forces `PRINT_FLOOR_PLAN_THEME`, one floor per page,
  `break-inside: avoid`, `print-color-adjust: exact` where supported. Because
  some browsers still drop background colours, the short label and pattern are
  the print-safe encodings — never the fill alone.
- Large floors: a 96 × 96 floor is 9 216 squares — at A3 that is ~1 mm per
  square, so it is a *navigation* view, not a printed one. Printing is
  explicitly out of scope for this release.

### 4.1 The packed render model

The renderer decision above only works because the render model stopped being a
list of per-square objects. `buildFloorRenderModel` returns two parallel
representations:

```ts
interface CellAppearance {
  kind: FloorCell["kind"];
  categoryId: string | null;
  color: string;
  inkColor: string;
  shortLabel: string;
  pattern: CellPattern;
}

interface FloorRenderModel {
  floorId: string;
  floorName: string;
  rows: number;
  cols: number;
  cellAppearanceIndex: Uint16Array; // exactly rows * cols entries, row-major
  appearances: CellAppearance[];    // at most maxCategories + 3
  legend: LegendEntry[];
  summary: string;
  appearanceAt(row: number, col: number): CellAppearance | null;
  describeCell(row: number, col: number): { ariaLabel: string; tooltip: string } | null;
}
```

A floor only ever shows a handful of distinct appearances — one per category,
plus empty, plus void, plus the unknown-category fallback — so those are
allocated once and shared, and each square costs a 2-byte index into that table.

The two fields that could **not** be shared are `ariaLabel` and `tooltip`:
they name the square's position ("Row 7, column 12"), so one exists per square.
They are therefore derived on demand for the single square that is focused or
hovered, by `describeCell(row, col)`, instead of being pre-allocated 9 216
times. On the old model those two derived strings alone were 41 of the ~190
serialized bytes of a square.

Measured with one model built per fresh process, 4 categories, ~40 % machines
(`render.test.ts` pins the regression guard; the numbers below are the harness
output):

| Floor | Cells | Before: one object per square | After: packed |
| --- | --- | --- | --- |
| 40 × 40 | 1 600 | 313 554 B (196.0 B/cell), 1 607 objects, 533 005 B retained heap | 3 536 B (2.2 B/cell), 9 objects + 1 typed array, 9 523 B retained |
| 96 × 96 | 9 216 | 1 806 292 B (196.0 B/cell), 9 223 objects, 3 032 223 B retained | 18 768 B (2.0 B/cell), 9 objects + 1 typed array, 21 123 B retained |

That is ~89× / ~96× smaller serialized, ~56× / ~144× less retained heap, and
~179× / ~1 024× fewer heap objects (counts include the two accessor functions
and the shared appearance table, which the per-cell model did not have). The
retained-heap figure is the one that matters for a running page: at the ceiling
a per-cell model cost ~3 MB per floor (~18 MB for six), the packed one costs
~21 KB per floor (~127 KB for six).

`getCellAppearance(plan, floorId, row, col)` is kept for callers that need one
square without a model; it re-walks the plan and returns the appearance *with*
its derived strings. `checkRenderModel(model)` asserts the invariant (index
width, table size, every index in range) and returns an empty list when the
model is well formed.

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
- **Public view is one image, not thousands of tab stops.** Render a `<figure>` with
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
| Rows / columns | 1–96 each | The owner asked for 96 × 96 as the absolute ceiling for very large gyms. 9 216 squares is only viable because the render model is packed (section 4.1) and the renderer is SVG at that size; the v3 payload is 2 370 B for an empty floor. |
| Floors | 1–6 | Realistic building; six 96 × 96 empty floors is a 14 000 B v3 payload (170 B gzipped), six fully painted ones ~170 KB. |
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

The plan has **two wire forms**, both owned by this module:

| Form | API | What it is |
| --- | --- | --- |
| Text (JSON) | `serializePlan` / `deserializePlan` / `parsePlanValue` | Canonical JSON. `cells` is the run-length token grammar from §8.1. Diffable, hand-inspectable, what a host stores if it keeps text. |
| Binary (packed) | `encodePlanBytes` / `decodePlanBytes` | The storage payload: a big-endian header plus a bit-packed grid. §8.2. |

Both validate through the same `validatePlan` / `parsePlanValue` path, so they
accept and reject exactly the same plans. `serializePlan` keeps returning
canonical JSON (unchanged signature, unchanged validation behaviour): the binary
form is **added**, not substituted, so a host that stores text keeps working.
Storage holds the binary payload; the JSON form is the migration source, the
debug/export form and the format a `TEXT` column would hold.

`serializePlan` writes **canonical JSON**: known fields only, fixed key order,
current `schemaVersion`, no `undefined`. Unknown fields are stripped, so storage
is stable and diffable. `title`, `categories` and each floor's
`id`/`name`/`rows`/`cols` are written as-is; `cells` is the only field whose
shape schema v2 changed, and schema v3 leaves that text grammar alone.

### 8.1 The v2 text cell format (still the JSON form in v3)

In memory a floor is a dense `FloorCell[][]`. On the wire each row is an array of
**tokens**, in left-to-right order:

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

The text decoder also accepts the expanded v1-style cell objects
(`{"kind":"empty"}`, `{"kind":"machine","categoryId":"cat-1"}`) inside a token
row. That keeps `validatePlan(plan)` valid for an in-memory plan (a host may
call it directly on a live `GymFloorPlan`), lets a tiny fixture be written by
hand, and means the encoder is the only place that must know the token grammar.

The text format is implemented in `wire.ts`
([`src/modules/gym-floor-plan/wire.ts`](../../src/modules/gym-floor-plan/wire.ts)):
`encodeFloorCells`, `decodeFloorRows`, `collapseEmptyAndVoidRuns` and the
v1 → v2 migration.

### 8.2 The v3 binary format

Implemented in `wireBinary.ts`
([`src/modules/gym-floor-plan/wireBinary.ts`](../../src/modules/gym-floor-plan/wireBinary.ts));
the public validating entry points are `encodePlanBytes` / `decodePlanBytes` in
`model.ts`, because they must reuse `validatePlan` and `parsePlanValue`.

Text costs bytes for punctuation, not information: `"m:0"` is five bytes to say
"machine, category 0" — two bits of meaning. The binary form packs the cells
directly.

**Why 2 bits + an index only on machine cells.** A square is one of three kinds
(empty / void / machine), which is 2 bits. The category index is needed **only
on a machine square**: the two bits that distinguish square kinds are all an
empty square has to cost. At a realistic 40% machine density this is ~20% smaller
than a fixed `2 + indexBits` stride and, unlike a fixed stride, a mostly-open
plan (the common case) pays almost nothing.

#### Header (24 bytes, big-endian)

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 2 | magic `"NF"` = `0x4E 0x46` |
| 2 | 1 | payload version (3) |
| 3 | 1 | flags: bit0 `HAS_LABELS`, bits 1–7 reserved (must be 0) |
| 4 | 1 | floor count (1–6) |
| 5 | 1 | category index bit width (1–5) |
| 6 | 2 | max rows across floors (1–96) |
| 8 | 2 | max cols across floors (1–96) |
| 10 | 2 | category count |
| 12 | 2 | label count (0 ⇒ no label section at all) |
| 14 | 4 | total payload byte length, header included |
| 18 | 4 | FNV-1a 32-bit checksum of the body |
| 22 | 2 | reserved, must be 0 |

The width is `ceil(log2(max(2, categoryCount)))`: 1 bit for 0–2 categories, 2 for
3–4, 3 for 5–8, 4 for 9–16, 5 for up to 20. It is chosen **once per plan** and
recorded, so a plan with one category pays one index bit rather than five.

#### Body (offset 24 onward)

```
title                varint byteLength + UTF-8 bytes
categoryCount times: varint+bytes id
                     varint+bytes name
                     3 bytes RGB (expanded back to "#RRGGBB")
                     varint+bytes shortLabel
                     1 byte pattern index into CELL_PATTERNS
floorCount times:    varint+bytes id
                     varint+bytes name
                     uint16 rows, uint16 cols
                     varint gridByteLength
                     packed grid (that many bytes)
labelCount times:    varint cellOrdinal
                     varint byteLength
                     UTF-8 label bytes
```

"varint" is unsigned LEB128. No JSON, no zlib, no text framing anywhere.

#### Grid

Row-major, most-significant-bit first. Every cell starts with 2 kind bits
(`0` empty, `1` void, `2` machine, `3` reserved/invalid); a **machine cell is
immediately followed by `categoryBits` index bits**, and empty/void cells carry
no index. Each floor's grid is padded to a whole byte with zero bits, and the
decoder requires the leftover bits to be zero, so a hand-edited grid length is
an issue rather than a silent desync.

The grid is therefore a sequential bit stream and its byte length varies with
the machine count, which is why each floor carries an explicit
`gridByteLength` varint. The decoder bounds-checks that length against
`ceil(rows*cols*2/8) ≤ length ≤ ceil(rows*cols*(2+bits)/8)` **before**
allocation: a corrupt length cannot over-allocate.

#### Label side table

A per-square label ("Lat pulldown") must not inflate every cell, so labels live
in a side table after the floors and are addressed by a single flat ordinal:

```
cellOrdinal = floorOffset + row * cols + col
```

where `floorOffset` is the sum of `rows*cols` of the preceding floors. Entries
are written in ascending cell order and the decoder requires strictly ascending
ordinals (a repeat would silently drop a label). The consequences:

- **A plan with no labels pays ZERO label bytes** — no count prefix, no
  per-cell "has label" bit. Only `labelCount = 0` in the header.
- A single label costs `1 + 1 + utf8Length` bytes (ordinal varint + length
  varint + bytes) on a maximally-packed grid.

#### Integrity

1. magic + version + reserved/flags — a blob from another feature, another
   version or a hand-edited header is rejected by name
   (`invalid-binary-header`, `unsupported-schema-version`);
2. the declared total length must equal the actual length, so truncation and
   trailing garbage are caught **before** per-floor allocation
   (`invalid-binary-length`);
3. an FNV-1a 32-bit checksum over the body, so a flipped cell bit is
   `invalid-binary-checksum` instead of a silently different gym.

`decodePlanBytes` never throws: structural failures come back as
`{ ok: false, issues }` with the same issue shape `parsePlanValue` uses. Anything
that decodes structurally is then run through the same validation and
materialization path, so both entry points agree on what is valid.

### 8.3 Measured size

Bytes, same plans, same deterministic fixture (`wireBinary.test.ts` pins every
number below). "Realistic" = ~40% machines, ~8% void, 4 categories:

| Plan | v2 (JSON tokens) | v3 (binary) | Ratio |
| --- | --- | --- | --- |
| 40 × 40 × 6 | 42 470 | 3 615 | 11.7× |
| 80 × 80 × 3 | 83 309 | 6 915 | 12.0× |
| 128 × 128 × 2 | 140 608 | 11 626 | 12.1× |
| 256 × 256 × 1 | 278 933 | 23 056 | 12.1× |

The index width is the only thing that moves the ratio with the category count
(40 × 40 × 6, same plan shape):

| Categories | Index bits | v2 | v3 | Ratio |
| --- | --- | --- | --- | --- |
| 2 | 1 | 42 296 | 3 093 | 13.7× |
| 4 | 2 | 42 470 | 3 615 | 11.7× |
| 8 | 3 | 42 824 | 4 184 | 10.2× |

The 80 × 80 and larger rows are measured through the structural packer to show
how the format scales. With the ceiling at 96 × 96 the 80 × 80 row is now a
plan the editor really can store; 128 × 128 and 256 × 256 still are not.

#### At the 96 × 96 ceiling

Measured by `render.test.ts` (`96 × 96 round-trip through both wire forms`),
same fixture shape (~40 % machines, ~8 % void, 4 categories):

| Plan | v3 (binary) | of which header | v2 (JSON tokens) | gzip(v3) |
| --- | --- | --- | --- | --- |
| 96 × 96 × 1, all empty | 2 370 B | 24 B | 1 196 B | 90 B |
| 96 × 96 × 1, realistic | 3 388 B | 24 B | 44 926 B | 568 B |
| 96 × 96 × 6, all empty | 14 000 B | 24 B | 6 796 B | 170 B |

That is ~2.3 KB per empty floor and ~3.4 KB per realistic floor before gzip —
the figure quoted in the plan for the ceiling. Note the crossing point: at
96 × 96 an *all-empty* floor is the one case where the v3 binary is **larger**
than the v2 token text (2 370 B vs 1 196 B), because six all-empty floors
run-length encode to almost nothing in JSON while the packed grid still pays a
flat 2 bits per square. v3 wins decisively on any painted plan (44 926 B vs
3 388 B at the same size), and storage always compresses, so v3 stays the
storage format — but the all-empty case is worth knowing when reading a
payload-size table.

The label side table's widest cell ordinal grows with the ceiling: six 96 × 96
floors have 55 296 cells, so the largest ordinal is 55 295, which takes 3
varint bytes instead of the 2 that covered 40 × 40 × 6 (9 600 cells). A plan
with no labels still pays zero label bytes.

For comparison, the v1 dense form of the same 40 × 40 × 6 plan is 164 231 B for
the all-empty case and 385 031 B for the all-machine case (§8.4).

### 8.4 Text vs binary, and which to store

`wire-size.test.ts` still measures the text form against the v1 dense form, and
these are the numbers it asserts:

| Plan | v1 (dense) | v2 (RLE) | Saving |
| --- | --- | --- | --- |
| 12 × 12, empty (default plan) | 2 703 B | 363 B | 7.4× |
| 40 × 40, all machine | 64 311 B | 9 911 B | 6.5× |
| 40 × 40 × 6, all machine | 385 031 B | 58 631 B | 6.6× |
| 40 × 40 × 6, all empty | 164 231 B | 3 191 B | 51.5× |
| 40 × 40 × 6, labelled machines (worst case) | 596 231 B | 173 831 B | 3.4× |

An all-machine floor is the case the text RLE helps least (one token per painted
square either way, minus the repeated category id); realistic plans are mostly
open floor and void and land around 7×; the empty/void extremes gain more than
50×.

The binary form beats all of those and is what a `BLOB` column should hold. Two
things to know before storing text instead:

- The binary payload is **not** self-contained metadata-wise: it carries the
  title, category definitions and floor geometry, so a binary payload is the
  whole plan. That is deliberate — one column, one decode.
- The text form is the migration source. A `TEXT` column holding v2 JSON still
  loads, but it is ~12× larger on disk than the binary payload.

### 8.5 Reading, migrating, compatibility

- `deserializePlan(string)` parses, migrates and validates.
  `parsePlanValue(value)` does the same for an already-parsed value (NexusFit's
  nested `gym_config` blob).
- `decodePlanBytes(bytes)` reads the packed payload. It accepts **only the
  current binary version**: v1 and v2 plans are JSON, so they go through
  `deserializePlan` / `parsePlanValue`, which migrate them forward.
- All three return `{ ok: true, plan, warnings }` or `{ ok: false, issues }`;
  they never throw on bad input. `deserializePlan` and `parsePlanValue` keep
  their original signatures, and `encodePlanBytes` throws `FloorPlanError`
  (`invalid-plan`) on an invalid plan exactly as `serializePlan` does.
- A v1 record is migrated forward **and** a v2 record is migrated forward, so
  callers always receive the same in-memory `FloorCell[][]` and never see a
  token or a byte.
- `schemaVersion` is a required top-level field. A plan newer than the module is
  rejected with an actionable message (`unsupported-schema-version`); an older
  plan runs through `PLAN_MIGRATIONS` before validation.

`PLAN_MIGRATIONS[1]` is the v1 → v2 step. It converts each v1 cell object to a
token, deriving the machine's category index from the position of its
`categoryId` in the plan's own `categories` array, and collapses adjacent
`"e"`/`"v"` tokens into runs.

`PLAN_MIGRATIONS[2]` is the v2 → v3 step. v3 does not change the text grammar, so
this step **normalises** a v2 record into canonical v3 form: it decodes each
floor's rows (`decodeFloorRows` accepts the token grammar, runs *and* expanded
cell objects), then re-encodes them with `encodeFloorCells`. The result is the
one shape `serializePlan` emits, stamped `schemaVersion: 3`. A migrated v2 record
is therefore byte-for-byte what `serializePlan` would have written, and it packs
to the binary form without a second pass.

Two failure modes are deliberate in both steps:

- **Unknown `categoryId` in a v1 plan.** Validation reports
  `unknown-category` and the plan fails to load. The migration does not drop
  the square, invent a category or fall back to empty: losing owner data
  silently is worse than refusing to load.
- **A floor whose rows do not decode.** The migration passes that floor through
  untouched rather than repairing it, so the good, actionable issue codes
  (`invalid-cells`, `unknown-category`) come from the decoder where they already
  live.
- **A v2 record mislabelled as `schemaVersion: 1`.** The v1 migration rejects
  any v1 cell that is not an object, so token strings cannot masquerade as v1
  cells.

The reverse direction is not supported: a v1-shaped decoder cannot read v2
output (it would see strings where it expects cell objects), and no text decoder
can read a binary payload. That is exactly why the version is checked before
anything else, in the JSON envelope and in the binary header alike.

Future versions follow the same three-step recipe:

```ts
// 1. Bump FLOOR_PLAN_SCHEMA_VERSION.
// 2. Register a migration keyed by the version it migrates FROM.
PLAN_MIGRATIONS[3] = (raw) => ({ ...raw, schemaVersion: 4 /* ... */ });
// 3. Extend validation for the new fields.
```

There is no v0 migration: the feature is new, so an unversioned or version-0
plan is rejected with `missing-migration` rather than guessed at. If a beta
ships with a different shape, add the migration then.

`parsePlanValue` and `deserializePlan` accept an optional migration table
(second argument). Hosts normally omit it and use the module's own table; the
parameter exists so the migration loop is testable and so a host with a custom
schema lineage can supply its own. If a host supplies a table it must still
include the `1` and `2` entries, or v1 and v2 records stop loading.

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
  under 1 KB (schema v2 RLE). At the 96 × 96 ceiling the v3 payload is 2 370 B
  for one empty floor and 3 388 B for a realistic one (measured, section 8.3);
  six empty floors are 14 000 B, or 170 B gzipped. The worst case (6 × 96 × 96,
  every square a labelled machine) is ~1.4 MB of text / ~0.8 MB of v3 — check
  the config POST body limit only if a gym is expected to paint every floor
  densely.
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
4. ~~**Real maximum grid:** is 40 × 40 per floor enough for the largest
   floor?~~ **Answered: 96 × 96 is the absolute ceiling**, implemented in
   `FLOOR_PLAN_LIMITS`. Print size is out of scope for this release.
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
