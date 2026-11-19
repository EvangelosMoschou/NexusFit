/**
 * Gym floor plan — portable data model.
 *
 * Everything under `src/modules/gym-floor-plan/` is deliberately self-contained:
 * it must not import from the host application (`@/lib/db`, `@/config`,
 * `@/types`, ...). The host injects persistence (`FloorPlanStorageAdapter`) and
 * presentation (`FloorPlanTheme`, `FloorPlanLabels`) so the same module can be
 * dropped into another project unchanged.
 *
 * The plan is plain JSON: no class instances, no dates, no functions. That is
 * what makes it safe to store in a config blob, diff, export and migrate.
 */

/**
 * Current serialized schema version. Bump whenever the stored shape changes.
 *
 * v1 stored `cells` as `[{ kind: "empty" }, ...]` — ~16 bytes for an empty
 * square, which dominated the size of any realistic plan. v2 keeps the same
 * in-memory `FloorCell[][]` but serializes each row as a list of run-length
 * encoded tokens (see `wire.ts` and `serializePlan`).
 *
 * v3 adds a **packed binary payload** (see `wireBinary.ts`, `encodePlanBytes`
 * and `decodePlanBytes`): each cell costs `2 + categoryBits` bits instead of
 * several bytes of JSON punctuation, which is what storage now holds. The JSON
 * envelope keeps the v2 token grammar as its text form, so `serializePlan` /
 * `deserializePlan` keep working unchanged for hosts that store text.
 *
 * Older plans still load: a v1 record goes through `PLAN_MIGRATIONS[1]` and a
 * v2 record through `PLAN_MIGRATIONS[2]` before validation.
 */
export const FLOOR_PLAN_SCHEMA_VERSION = 3;

/**
 * Hard limits.
 *
 * `maxRows` / `maxCols` are 96: 9 216 squares, the largest floor the owner asked
 * for ("96 × 96 as the absolute ceiling for very large gyms"). The ceiling did
 * not cost anything on the wire: schema v3 packs a cell into 2 bits plus an
 * index that only a machine square pays, so a 96 × 96 floor is ~2.3 KB, only
 * 4× the bytes of a 40 × 40 while carrying 5.8× the squares.
 *
 * What DID have to change is the render model. A per-square JavaScript object
 * costs ~330 bytes of retained heap once the two derived accessible strings are
 * counted, so 9 216 of them is ~3 MB per floor and ~18 MB for six — for data
 * that is two of eleven colours plus a 1–3 character label. `FloorRenderModel`
 * is therefore a `Uint16Array` of appearance indices (2 bytes per square,
 * 18 KB at the ceiling) plus a table of at most `maxCategories + 3` resolved
 * appearances, and the accessible strings are derived on demand for the one
 * square that is focused. See section "Packed render model" in the module
 * README.
 */
export const FLOOR_PLAN_LIMITS = {
  minRows: 1,
  maxRows: 96,
  minCols: 1,
  maxCols: 96,
  maxFloors: 6,
  maxCategories: 20,
  maxPlanTitleLength: 80,
  maxFloorNameLength: 40,
  maxCategoryNameLength: 40,
  /** Secondary (non-colour) encoding shown inside every machine square. */
  maxShortLabelLength: 3,
  /** Optional per-square machine name, e.g. "Lat pulldown". */
  maxCellLabelLength: 40,
} as const;

/**
 * Tertiary encoding for a category, drawn as a CSS background pattern on top of
 * the category colour. The short label is the primary secondary encoding; the
 * pattern is a third channel for printed plans and users who cannot separate
 * the palette at all.
 */
export type CellPattern = "solid" | "diagonal" | "dots" | "grid" | "cross";

export const CELL_PATTERNS: readonly CellPattern[] = ["solid", "diagonal", "dots", "grid", "cross"];

/** A colour category the gym owner defines, e.g. "Impulse machines" = blue. */
export interface Category {
  /** Stable slug, e.g. `cat-1`; referenced by machine cells. Never reused. */
  id: string;
  name: string;
  /** `#RRGGBB` (normalised to upper case by `createCategory`). */
  color: string;
  /** 1–3 characters shown in every square of this category, e.g. `IM`. */
  shortLabel: string;
  pattern: CellPattern;
}

/** Plain walkable floor: no equipment, not void. */
export interface EmptyCell {
  kind: "empty";
}

/** A square occupied by a machine/station of a category. */
export interface MachineCell {
  kind: "machine";
  categoryId: string;
  /** Optional machine name, e.g. "Chest press". */
  label?: string;
}

/**
 * Structurally unavailable square (column, wall notch, storage room, ...).
 * Void is intentionally NOT a category: it has no owner-defined colour and
 * never appears in the category list, so it cannot be confused with equipment.
 * The legend shows one fixed void entry (`kind: "void"`), not a category entry.
 */
export interface VoidCell {
  kind: "void";
}

export type FloorCell = EmptyCell | MachineCell | VoidCell;

export interface CellCoord {
  row: number;
  col: number;
}

export interface CreatePlanOptions {
  title?: string;
  /** Name of the automatically created first floor. */
  floorName?: string;
  rows?: number;
  cols?: number;
}

export interface CreateFloorInput {
  id: string;
  name: string;
  rows: number;
  cols: number;
}

export interface AddFloorInput {
  /** Omit to generate `floor-N`. */
  id?: string;
  name: string;
  rows: number;
  cols: number;
}

export interface CreateCategoryInput {
  id: string;
  name: string;
  color: string;
  /** Omit to derive it from the name (`deriveShortLabel`). */
  shortLabel?: string;
  /** Defaults to `"solid"`. */
  pattern?: CellPattern;
}

export interface AddCategoryInput {
  /** Omit to generate `cat-N`. */
  id?: string;
  name: string;
  color: string;
  shortLabel?: string;
  pattern?: CellPattern;
}

export type CategoryPatch = Partial<Pick<Category, "name" | "color" | "shortLabel" | "pattern">>;

/** One floor of the gym. `cells[row][col]`, row 0 at the top of the plan. */
export interface Floor {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cells: FloorCell[][];
}

/**
 * The whole plan. Array order is display order for both floors and categories.
 * `schemaVersion` is part of the serialized form so migrations are possible.
 */
export interface GymFloorPlan {
  schemaVersion: number;
  title: string;
  categories: Category[];
  floors: Floor[];
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Stable machine-readable code, e.g. `unknown-category`. */
  code: string;
  message: string;
  /** Optional JSON path, e.g. `floors[0].cells[2][3]`. */
  path?: string;
}

export interface ValidationResult {
  /** True when there are no errors. Warnings do not make a plan invalid. */
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export type DeserializeResult =
  | { ok: true; plan: GymFloorPlan; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

/** Codes thrown by model operations (as opposed to validation issue codes). */
export type FloorPlanErrorCode =
  | "invalid-dimensions"
  | "invalid-id"
  | "invalid-name"
  | "invalid-title"
  | "invalid-color"
  | "invalid-short-label"
  | "invalid-pattern"
  | "invalid-label"
  | "invalid-cell"
  | "invalid-reassignment"
  | "duplicate-id"
  | "unknown-floor"
  | "unknown-category"
  | "out-of-bounds"
  | "last-floor"
  | "too-many-floors"
  | "too-many-categories"
  | "invalid-plan";

/**
 * Persistence seam injected by the host.
 *
 * The module never touches SQLite, localStorage or the network. A host adapter
 * can be backed by any of them:
 *
 * ```ts
 * const storage: FloorPlanStorageAdapter = {
 *   load: async () => localStorage.getItem("floor-plan"),
 *   save: async (json) => localStorage.setItem("floor-plan", json),
 * };
 * ```
 */
export interface FloorPlanStorageAdapter {
  /** Previously serialized plan, or null when the host has none yet. */
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
}

/**
 * Presentation seam injected by the host. Colours are `#RRGGBB` so the module
 * can compute a WCAG-contrast ink colour for labels and patterns. A host that
 * uses CSS variables can resolve them to hex before passing the theme.
 */
export interface FloorPlanTheme {
  /** Page/card background behind the grid. */
  surfaceColor: string;
  /** Plain walkable squares. */
  emptyColor: string;
  /** Grid lines between squares. */
  gridLineColor: string;
  /** Fixed colour for void squares — never owner-editable. */
  voidColor: string;
  /** Text colour used outside coloured squares. */
  inkColor: string;
  /** Secondary text (legend counts, axis hints). */
  mutedInkColor: string;
}

/**
 * User-facing strings. The module ships English defaults; a Greek host (like
 * NexusFit) overrides them without forking the module.
 */
export interface FloorPlanLabels {
  unavailable: string;
  openFloor: string;
  equipment: string;
  row: string;
  column: string;
  noEquipment: string;
  unknownCategory: string;
}

/** CSS background used to draw a category pattern over its colour. */
export interface PatternBackground {
  backgroundImage: string;
  backgroundSize?: string;
}

/**
 * A **resolved** appearance for one square: everything a renderer needs to draw
 * a square, with nothing left to look up and nothing that depends on where the
 * square is.
 *
 * A floor has at most `maxCategories + 3` distinct appearances (one per
 * category, plus empty, void, and the unknown-category fallback), so these are
 * shared by every square that looks the same and are stored once in
 * `FloorRenderModel.appearances`. The per-square cost is then the 2-byte index
 * into that table, not a copy of these six fields.
 *
 * Deliberately NOT here: `ariaLabel` and `tooltip`. They mention the square's
 * position ("Row 7, column 12"), so they cannot be shared between squares, and
 * they were 41 of the ~190 bytes a per-square object cost. They are derived on
 * demand for the single focused square by `FloorRenderModel.describeCell`.
 */
export interface CellAppearance {
  kind: FloorCell["kind"];
  categoryId: string | null;
  color: string;
  /** Contrast-safe text colour for `shortLabel` on `color`. */
  inkColor: string;
  /** Secondary encoding: empty for plain floor, `×` for void. */
  shortLabel: string;
  pattern: CellPattern;
}

export interface LegendEntry {
  kind: "category" | "void";
  id: string;
  name: string;
  color: string;
  inkColor: string;
  shortLabel: string;
  pattern: CellPattern;
  /** Number of squares using this category on the rendered floor. */
  count: number;
}

/**
 * Pure, packed render model.
 *
 * Two parallel representations instead of one object per square:
 *
 * - `cellAppearanceIndex` — a `Uint16Array` with exactly `rows * cols` entries.
 *   Entry `row * cols + col` is the position of that square's appearance in
 *   `appearances`. Row-major, so a renderer walks it linearly and never has to
 *   allocate a per-square object.
 * - `appearances` — the distinct resolved appearances, at most
 *   `maxCategories + 3` of them, each allocated once and shared.
 *
 * What this buys, measured per fresh process with a 4-category, ~40 % machine
 * floor (full table in `docs/features/gym-floor-plan.md` §4.1):
 *
 * | Floor   | Cells | Per-cell model                            | Packed model                        |
 * | ------- | ----- | ----------------------------------------- | ----------------------------------- |
 * | 40 × 40 | 1 600 | 313 554 B, 1 607 objs, 533 005 B heap      | 3 536 B, 9 objs, 9 523 B heap        |
 * | 96 × 96 | 9 216 | 1 806 292 B, 9 223 objs, 3 032 223 B heap  | 18 768 B, 9 objs, 21 123 B heap      |
 *
 * The allocation count is flat in the grid size: only the 2-byte-per-square
 * index array grows, which is 3 200 B at 40 × 40 and 18 432 B at 96 × 96.
 *
 * The two accessor methods are O(1) and are the only place the index is turned
 * back into an appearance, so a consumer never does the arithmetic itself and
 * never has to bounds-check.
 */
export interface FloorRenderModel {
  floorId: string;
  floorName: string;
  rows: number;
  cols: number;
  /** Row-major appearance INDEX, exactly rows*cols entries. */
  cellAppearanceIndex: Uint16Array;
  /** The distinct appearances referenced by the index array. */
  appearances: CellAppearance[];
  legend: LegendEntry[];
  /** Screen-reader summary of the floor (also used as the figure alt text). */
  summary: string;
  /** O(1). Null when out of bounds. */
  appearanceAt(row: number, col: number): CellAppearance | null;
  /** The accessible strings, derived on demand for ONE square. */
  describeCell(row: number, col: number): { ariaLabel: string; tooltip: string } | null;
}
