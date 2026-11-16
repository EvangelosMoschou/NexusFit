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
 * Current serialized schema version. Bump whenever the JSON shape changes.
 *
 * v1 stored `cells` as `[{ kind: "empty" }, ...]` — ~16 bytes for an empty
 * square, which dominated the size of any realistic plan. v2 keeps the same
 * in-memory `FloorCell[][]` but serializes each row as a list of run-length
 * encoded tokens (see `wire.ts` and `serializePlan`). A v1 plan still loads: it
 * goes through `PLAN_MIGRATIONS[1]` before validation.
 */
export const FLOOR_PLAN_SCHEMA_VERSION = 2;

/**
 * Hard limits.
 *
 * They keep one plan small enough to live inside a JSON config blob and small
 * enough to render as DOM cells without pan/zoom. At 40 × 40 a floor is 1 600
 * squares. Because schema v2 run-length encodes empty floor and void, six such
 * floors of mostly empty plan JSON serialize to a few kilobytes rather than the
 * ~160 KB the dense v1 form cost (a fully painted floor is still bounded: one
 * short token per machine square). Anything larger needs a different renderer
 * (SVG/canvas) and a separate storage table, so it is rejected rather than
 * silently degrading the editor.
 */
export const FLOOR_PLAN_LIMITS = {
  minRows: 1,
  maxRows: 40,
  minCols: 1,
  maxCols: 40,
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

/** Inline styles for a CSS Grid container that keeps square cells. */
export interface GridTemplate {
  gridTemplateColumns: string;
  gridTemplateRows: string;
  aspectRatio: string;
}

/** CSS background used to draw a category pattern over its colour. */
export interface PatternBackground {
  backgroundImage: string;
  backgroundSize?: string;
}

/** Everything a renderer needs for one square. */
export interface CellAppearance {
  kind: FloorCell["kind"];
  categoryId: string | null;
  color: string;
  /** Contrast-safe text colour for `shortLabel` on `color`. */
  inkColor: string;
  /** Secondary encoding: empty for plain floor, `×` for void. */
  shortLabel: string;
  pattern: CellPattern;
  /** Full accessible name for the square. */
  ariaLabel: string;
  /** Tooltip / hover text. */
  tooltip: string;
}

export interface RenderedCell extends CellAppearance {
  row: number;
  col: number;
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

/** Pure, row-major render model: the React component only maps over it. */
export interface FloorRenderModel {
  floorId: string;
  floorName: string;
  rows: number;
  cols: number;
  grid: GridTemplate;
  /** Row-major, `rows * cols` entries. */
  cells: RenderedCell[];
  legend: LegendEntry[];
  /** Screen-reader summary of the floor (also used as the figure alt text). */
  summary: string;
}
