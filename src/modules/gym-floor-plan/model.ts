/**
 * Gym floor plan — pure model functions.
 *
 * Every mutation returns a new plan and never touches the input. That makes
 * React state updates trivial and lets the host implement undo by keeping the
 * previous reference. The module has no I/O: persistence and theming are
 * injected by the host (see `types.ts`).
 *
 * Errors are thrown for programming/UI mistakes (unknown id, out of bounds,
 * invalid category colour). Untrusted input goes through `validatePlan` /
 * `deserializePlan`, which never throw and return issues instead.
 */

import {
  CELL_PATTERNS,
  FLOOR_PLAN_LIMITS,
  FLOOR_PLAN_SCHEMA_VERSION,
  type AddCategoryInput,
  type AddFloorInput,
  type Category,
  type CategoryPatch,
  type CellCoord,
  type CellPattern,
  type CreateCategoryInput,
  type CreateFloorInput,
  type CreatePlanOptions,
  type DeserializeResult,
  type Floor,
  type FloorCell,
  type FloorPlanErrorCode,
  type GymFloorPlan,
  type MachineCell,
  type ValidationIssue,
  type ValidationResult,
} from "./types";
import {
  EMPTY_CELL,
  decodeFloorRows,
  encodeFloorCells,
  migrateV1PlanRecord,
  scanMachineReferences,
} from "./wire";
import { migrateV2PlanRecord, packPlanRecord, unpackPlanRecord } from "./wireBinary";

const DEFAULT_ROWS = 12;
const DEFAULT_COLS = 12;
const DEFAULT_TITLE = "Gym floor plan";
const DEFAULT_FLOOR_NAME = "Ground floor";

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PREFIX_PATTERN = /^[a-z][a-z0-9-]*$/;

export class FloorPlanError extends Error {
  readonly code: FloorPlanErrorCode;

  constructor(code: FloorPlanErrorCode, message: string) {
    super(message);
    this.name = "FloorPlanError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function describeValue(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function assertId(id: unknown, what: string): asserts id is string {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new FloorPlanError(
      "invalid-id",
      `${what} id must match ${ID_PATTERN} (got ${describeValue(id)}).`
    );
  }
}

function assertDimension(value: unknown, axis: "rows" | "cols"): asserts value is number {
  const min = axis === "rows" ? FLOOR_PLAN_LIMITS.minRows : FLOOR_PLAN_LIMITS.minCols;
  const max = axis === "rows" ? FLOOR_PLAN_LIMITS.maxRows : FLOOR_PLAN_LIMITS.maxCols;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new FloorPlanError(
      "invalid-dimensions",
      `${axis} must be an integer between ${min} and ${max} (got ${describeValue(value)}).`
    );
  }
}

function assertName(
  name: unknown,
  maxLength: number,
  code: "invalid-name" | "invalid-title"
): asserts name is string {
  if (!isNonEmptyString(name)) {
    throw new FloorPlanError(code, `Name must be a non-empty string (got ${describeValue(name)}).`);
  }
  if (name.trim().length > maxLength) {
    throw new FloorPlanError(code, `Name must be at most ${maxLength} characters.`);
  }
}

function assertFloorName(name: unknown): asserts name is string {
  assertName(name, FLOOR_PLAN_LIMITS.maxFloorNameLength, "invalid-name");
}

function assertCategoryName(name: unknown): asserts name is string {
  assertName(name, FLOOR_PLAN_LIMITS.maxCategoryNameLength, "invalid-name");
}

function assertPlanTitle(title: unknown): asserts title is string {
  assertName(title, FLOOR_PLAN_LIMITS.maxPlanTitleLength, "invalid-title");
}

function assertColor(color: unknown): asserts color is string {
  if (typeof color !== "string" || !COLOR_PATTERN.test(color)) {
    throw new FloorPlanError(
      "invalid-color",
      `Category colour must be #RRGGBB (got ${describeValue(color)}).`
    );
  }
}

function assertPattern(pattern: unknown): asserts pattern is CellPattern {
  if (typeof pattern !== "string" || !CELL_PATTERNS.includes(pattern as CellPattern)) {
    throw new FloorPlanError(
      "invalid-pattern",
      `Pattern must be one of ${CELL_PATTERNS.join(", ")} (got ${describeValue(pattern)}).`
    );
  }
}

function assertShortLabel(label: unknown): asserts label is string {
  if (typeof label !== "string") {
    throw new FloorPlanError(
      "invalid-short-label",
      `Short label must be 1–${FLOOR_PLAN_LIMITS.maxShortLabelLength} characters (got ${describeValue(label)}).`
    );
  }
  const length = [...label].length;
  if (length < 1 || length > FLOOR_PLAN_LIMITS.maxShortLabelLength) {
    throw new FloorPlanError(
      "invalid-short-label",
      `Short label must be 1–${FLOOR_PLAN_LIMITS.maxShortLabelLength} characters (got ${describeValue(label)}).`
    );
  }
  if (/\s/.test(label)) {
    throw new FloorPlanError("invalid-short-label", "Short label must not contain whitespace.");
  }
}

function assertCellLabel(label: unknown): asserts label is string {
  if (!isNonEmptyString(label)) {
    throw new FloorPlanError("invalid-label", "Machine label must be a non-empty string.");
  }
  if (label.trim().length > FLOOR_PLAN_LIMITS.maxCellLabelLength) {
    throw new FloorPlanError(
      "invalid-label",
      `Machine label must be at most ${FLOOR_PLAN_LIMITS.maxCellLabelLength} characters.`
    );
  }
}

function assertCoord(row: number, col: number, floor: Floor): void {
  if (!Number.isInteger(row) || row < 0 || row >= floor.rows) {
    throw new FloorPlanError(
      "out-of-bounds",
      `Row ${describeValue(row)} is outside 0..${floor.rows - 1} on floor "${floor.id}".`
    );
  }
  if (!Number.isInteger(col) || col < 0 || col >= floor.cols) {
    throw new FloorPlanError(
      "out-of-bounds",
      `Column ${describeValue(col)} is outside 0..${floor.cols - 1} on floor "${floor.id}".`
    );
  }
}

function assertCell(cell: unknown, categories: readonly Category[]): asserts cell is FloorCell {
  if (!isRecord(cell)) {
    throw new FloorPlanError("invalid-cell", "Cell must be an object.");
  }
  const kind = cell.kind;
  if (kind === "empty" || kind === "void") return;
  if (kind !== "machine") {
    throw new FloorPlanError(
      "invalid-cell",
      `Cell kind must be "empty", "machine" or "void" (got ${describeValue(kind)}).`
    );
  }
  if (typeof cell.categoryId !== "string" || cell.categoryId.length === 0) {
    throw new FloorPlanError("invalid-cell", "Machine cell must reference a category id.");
  }
  if (!categories.some((category) => category.id === cell.categoryId)) {
    throw new FloorPlanError(
      "unknown-category",
      `Machine cell references unknown category "${cell.categoryId}".`
    );
  }
  if (cell.label !== undefined) assertCellLabel(cell.label);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * Derives the secondary encoding from a category name.
 *
 * "Impulse machines" -> "IM", "Toilets" -> "TO", "Ελεύθερα Βάρη" -> "ΕΒ".
 * The owner can always override it; this only removes a blank field from the
 * common path.
 */
export function deriveShortLabel(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => Array.from(word)[0] ?? "")
          .join("")
      : Array.from(words[0] ?? "")
          .slice(0, 2)
          .join("");
  const label = letters.toUpperCase();
  return label.length > 0 ? label.slice(0, FLOOR_PLAN_LIMITS.maxShortLabelLength) : "?";
}

/**
 * Returns the smallest unused `${prefix}-N` id. Deterministic, so tests and
 * server-rendered output do not depend on `crypto.randomUUID()`.
 */
export function nextId(prefix: string, existingIds: readonly string[]): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new FloorPlanError(
      "invalid-id",
      `Id prefix must match ${PREFIX_PATTERN} (got ${describeValue(prefix)}).`
    );
  }
  const used = new Set(existingIds);
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export function createEmptyCells(rows: number, cols: number): FloorCell[][] {
  assertDimension(rows, "rows");
  assertDimension(cols, "cols");
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (): FloorCell => EMPTY_CELL)
  );
}

export function findFloor(plan: GymFloorPlan, floorId: string): Floor | undefined {
  return plan.floors.find((floor) => floor.id === floorId);
}

function requireFloor(plan: GymFloorPlan, floorId: string): Floor {
  const floor = findFloor(plan, floorId);
  if (!floor) {
    throw new FloorPlanError("unknown-floor", `No floor with id "${floorId}".`);
  }
  return floor;
}

function cellsEqual(a: FloorCell, b: FloorCell): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "machine" && b.kind === "machine") {
    return a.categoryId === b.categoryId && (a.label ?? "") === (b.label ?? "");
  }
  return true;
}

function categoriesEqual(a: Category, b: Category): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.color === b.color &&
    a.shortLabel === b.shortLabel &&
    a.pattern === b.pattern
  );
}

// ---------------------------------------------------------------------------
// Plan and floor creation
// ---------------------------------------------------------------------------

export function createEmptyPlan(options: CreatePlanOptions = {}): GymFloorPlan {
  const rows = options.rows ?? DEFAULT_ROWS;
  const cols = options.cols ?? DEFAULT_COLS;
  assertDimension(rows, "rows");
  assertDimension(cols, "cols");

  const title = (options.title ?? DEFAULT_TITLE).trim();
  assertPlanTitle(title);
  const floorName = (options.floorName ?? DEFAULT_FLOOR_NAME).trim();
  assertFloorName(floorName);

  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    title,
    categories: [],
    floors: [createFloor({ id: "floor-1", name: floorName, rows, cols })],
  };
}

export function createFloor(input: CreateFloorInput): Floor {
  assertId(input.id, "Floor");
  const name = input.name.trim();
  assertFloorName(name);
  assertDimension(input.rows, "rows");
  assertDimension(input.cols, "cols");

  return {
    id: input.id,
    name,
    rows: input.rows,
    cols: input.cols,
    cells: createEmptyCells(input.rows, input.cols),
  };
}

export function addFloor(plan: GymFloorPlan, input: AddFloorInput): GymFloorPlan {
  if (plan.floors.length >= FLOOR_PLAN_LIMITS.maxFloors) {
    throw new FloorPlanError(
      "too-many-floors",
      `A plan can have at most ${FLOOR_PLAN_LIMITS.maxFloors} floors.`
    );
  }

  const id =
    input.id ??
    nextId(
      "floor",
      plan.floors.map((floor) => floor.id)
    );
  if (plan.floors.some((floor) => floor.id === id)) {
    throw new FloorPlanError("duplicate-id", `Floor id "${id}" already exists.`);
  }

  const floor = createFloor({ id, name: input.name, rows: input.rows, cols: input.cols });
  return { ...plan, floors: [...plan.floors, floor] };
}

export function removeFloor(plan: GymFloorPlan, floorId: string): GymFloorPlan {
  requireFloor(plan, floorId);
  if (plan.floors.length <= 1) {
    throw new FloorPlanError("last-floor", "A plan must keep at least one floor.");
  }
  return { ...plan, floors: plan.floors.filter((floor) => floor.id !== floorId) };
}

export function renameFloor(plan: GymFloorPlan, floorId: string, name: string): GymFloorPlan {
  const floor = requireFloor(plan, floorId);
  const nextName = name.trim();
  assertFloorName(nextName);
  if (nextName === floor.name) return plan;
  return {
    ...plan,
    floors: plan.floors.map((candidate) =>
      candidate.id === floorId ? { ...candidate, name: nextName } : candidate
    ),
  };
}

/**
 * Resizes a floor, anchored at the top-left corner.
 *
 * Cells that still fit keep their exact `(row, col)` position. Cells outside
 * the new bounds — equipment and void alike — are discarded. Newly exposed
 * squares are plain floor. The editor must call `countCellsOutsideBounds`
 * first and confirm when the result is non-zero; the model itself cannot ask.
 */
export function resizeFloor(
  plan: GymFloorPlan,
  floorId: string,
  rows: number,
  cols: number
): GymFloorPlan {
  assertDimension(rows, "rows");
  assertDimension(cols, "cols");
  const floor = requireFloor(plan, floorId);
  if (floor.rows === rows && floor.cols === cols) return plan;

  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col): FloorCell => {
      if (row < floor.rows && col < floor.cols) {
        return floor.cells[row]?.[col] ?? EMPTY_CELL;
      }
      return EMPTY_CELL;
    })
  );

  return {
    ...plan,
    floors: plan.floors.map((candidate) =>
      candidate.id === floorId ? { ...candidate, rows, cols, cells } : candidate
    ),
  };
}

/**
 * Counts non-empty cells that `resizeFloor(plan, floorId, rows, cols)` would
 * discard. Used by the resize confirmation dialog.
 */
export function countCellsOutsideBounds(floor: Floor, rows: number, cols: number): number {
  assertDimension(rows, "rows");
  assertDimension(cols, "cols");
  let count = 0;
  floor.cells.forEach((rowCells, row) => {
    rowCells.forEach((cell, col) => {
      if ((row >= rows || col >= cols) && cell.kind !== "empty") count += 1;
    });
  });
  return count;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export function getCell(plan: GymFloorPlan, floorId: string, row: number, col: number): FloorCell {
  const floor = requireFloor(plan, floorId);
  assertCoord(row, col, floor);
  return floor.cells[row]?.[col] ?? EMPTY_CELL;
}

export function setCell(
  plan: GymFloorPlan,
  floorId: string,
  row: number,
  col: number,
  cell: FloorCell
): GymFloorPlan {
  const floor = requireFloor(plan, floorId);
  assertCoord(row, col, floor);
  assertCell(cell, plan.categories);

  const current = floor.cells[row]?.[col];
  if (current && cellsEqual(current, cell)) return plan;

  const nextRow = [...floor.cells[row]];
  nextRow[col] = cell;
  const nextCells = [...floor.cells];
  nextCells[row] = nextRow;

  return {
    ...plan,
    floors: plan.floors.map((candidate) =>
      candidate.id === floorId ? { ...candidate, cells: nextCells } : candidate
    ),
  };
}

/**
 * Applies one brush stroke. Coordinates outside the floor are ignored rather
 * than throwing: a pointer drag can legitimately leave the grid between two
 * `pointermove` events, and the stroke should simply stop at the edge.
 * Duplicate coordinates are painted once.
 */
export function paintCells(
  plan: GymFloorPlan,
  floorId: string,
  coords: readonly CellCoord[],
  cell: FloorCell
): GymFloorPlan {
  const floor = requireFloor(plan, floorId);
  assertCell(cell, plan.categories);

  const seen = new Set<string>();
  let next = plan;
  for (const coord of coords) {
    if (!Number.isInteger(coord.row) || !Number.isInteger(coord.col)) continue;
    if (coord.row < 0 || coord.row >= floor.rows) continue;
    if (coord.col < 0 || coord.col >= floor.cols) continue;
    const key = `${coord.row}:${coord.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next = setCell(next, floorId, coord.row, coord.col, cell);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function createCategory(input: CreateCategoryInput): Category {
  assertId(input.id, "Category");
  const name = input.name.trim();
  assertCategoryName(name);
  assertColor(input.color);
  const shortLabel = (input.shortLabel ?? deriveShortLabel(name)).trim().toUpperCase();
  assertShortLabel(shortLabel);
  const pattern = input.pattern ?? "solid";
  assertPattern(pattern);

  return {
    id: input.id,
    name,
    color: input.color.toUpperCase(),
    shortLabel,
    pattern,
  };
}

export function addCategory(plan: GymFloorPlan, input: AddCategoryInput): GymFloorPlan {
  if (plan.categories.length >= FLOOR_PLAN_LIMITS.maxCategories) {
    throw new FloorPlanError(
      "too-many-categories",
      `A plan can have at most ${FLOOR_PLAN_LIMITS.maxCategories} categories.`
    );
  }

  const id =
    input.id ??
    nextId(
      "cat",
      plan.categories.map((category) => category.id)
    );
  if (plan.categories.some((category) => category.id === id)) {
    throw new FloorPlanError("duplicate-id", `Category id "${id}" already exists.`);
  }

  const category = createCategory({ ...input, id });
  return { ...plan, categories: [...plan.categories, category] };
}

export function updateCategory(
  plan: GymFloorPlan,
  categoryId: string,
  patch: CategoryPatch
): GymFloorPlan {
  const existing = plan.categories.find((category) => category.id === categoryId);
  if (!existing) {
    throw new FloorPlanError("unknown-category", `No category with id "${categoryId}".`);
  }

  const updated = createCategory({
    id: existing.id,
    name: patch.name ?? existing.name,
    color: patch.color ?? existing.color,
    shortLabel: patch.shortLabel ?? existing.shortLabel,
    pattern: patch.pattern ?? existing.pattern,
  });
  if (categoriesEqual(existing, updated)) return plan;

  return {
    ...plan,
    categories: plan.categories.map((category) =>
      category.id === categoryId ? updated : category
    ),
  };
}

/**
 * Deletes a category and decides what happens to the squares that use it.
 *
 * `reassignTo` is required on purpose — there is no silent default:
 *   - `null`      -> those squares become plain floor (equipment removed);
 *   - a category  -> those squares move to that category, keeping any machine
 *                    label, so a rename-like split does not lose data.
 *
 * Void squares and other categories are untouched. The editor should show
 * `countCategoryUsage` before asking, so the choice is informed.
 */
export function removeCategory(
  plan: GymFloorPlan,
  categoryId: string,
  reassignTo: string | null
): GymFloorPlan {
  const existing = plan.categories.find((category) => category.id === categoryId);
  if (!existing) {
    throw new FloorPlanError("unknown-category", `No category with id "${categoryId}".`);
  }
  if (reassignTo !== null) {
    if (reassignTo === categoryId) {
      throw new FloorPlanError(
        "invalid-reassignment",
        "A category cannot be reassigned to itself."
      );
    }
    if (!plan.categories.some((category) => category.id === reassignTo)) {
      throw new FloorPlanError("unknown-category", `No category with id "${reassignTo}".`);
    }
  }

  const floors = plan.floors.map((floor) => {
    let changed = false;
    const cells = floor.cells.map((rowCells) =>
      rowCells.map((cell): FloorCell => {
        if (cell.kind !== "machine" || cell.categoryId !== categoryId) return cell;
        changed = true;
        if (reassignTo === null) return EMPTY_CELL;
        const moved: MachineCell =
          cell.label === undefined
            ? { kind: "machine", categoryId: reassignTo }
            : { kind: "machine", categoryId: reassignTo, label: cell.label };
        return moved;
      })
    );
    return changed ? { ...floor, cells } : floor;
  });

  return {
    ...plan,
    categories: plan.categories.filter((category) => category.id !== categoryId),
    floors,
  };
}

/** Number of machine squares using a category, optionally on one floor only. */
export function countCategoryUsage(
  plan: GymFloorPlan,
  categoryId: string,
  floorId?: string
): number {
  if (!plan.categories.some((category) => category.id === categoryId)) {
    throw new FloorPlanError("unknown-category", `No category with id "${categoryId}".`);
  }
  const floors = floorId === undefined ? plan.floors : [requireFloor(plan, floorId)];
  let count = 0;
  for (const floor of floors) {
    for (const rowCells of floor.cells) {
      for (const cell of rowCells) {
        if (cell.kind === "machine" && cell.categoryId === categoryId) count += 1;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validationIssue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  path?: string
): ValidationIssue {
  return path === undefined ? { severity, code, message } : { severity, code, message, path };
}

/**
 * Validates an already-parsed plan value. Accepts `unknown` because the same
 * function guards deserialization of untrusted JSON. It never throws.
 */
export function validatePlan(input: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const error = (code: string, message: string, path?: string) =>
    errors.push(validationIssue("error", code, message, path));
  const warning = (code: string, message: string, path?: string) =>
    warnings.push(validationIssue("warning", code, message, path));

  if (!isRecord(input)) {
    error("not-an-object", "Floor plan must be a JSON object.");
    return { valid: false, errors, warnings };
  }

  // Schema version ---------------------------------------------------------
  const version = input.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    error(
      "invalid-schema-version",
      `schemaVersion must be an integer (got ${describeValue(version)}).`,
      "schemaVersion"
    );
  } else if (version !== FLOOR_PLAN_SCHEMA_VERSION) {
    error(
      "unsupported-schema-version",
      `Expected schema version ${FLOOR_PLAN_SCHEMA_VERSION}, received ${version}.`,
      "schemaVersion"
    );
  }

  // Title ------------------------------------------------------------------
  const title = input.title;
  if (typeof title !== "string") {
    error("invalid-title", "title must be a string.", "title");
  } else if (title.trim().length === 0) {
    error("invalid-title", "title must not be empty.", "title");
  } else if (title.trim().length > FLOOR_PLAN_LIMITS.maxPlanTitleLength) {
    error(
      "invalid-title",
      `title must be at most ${FLOOR_PLAN_LIMITS.maxPlanTitleLength} characters.`,
      "title"
    );
  }

  // Categories -------------------------------------------------------------
  const categoryIds = new Set<string>();
  /**
   * Category ids by array position, so a v2 `m:<index>` token can be resolved
   * back to an id. Entries stay `undefined` when the raw category at that
   * position carries no id, which keeps indexes aligned with the serialized
   * array (and lets the decoder report `unknown-category` for that index).
   */
  const categoryIdsByIndex: (string | undefined)[] = [];
  const categoryNames = new Map<string, { name: string; index: number }>();
  const categoryColors = new Map<string, string>();
  const categoryShortLabels = new Map<string, string>();

  if (!Array.isArray(input.categories)) {
    error("invalid-categories", "categories must be an array.", "categories");
  } else {
    if (input.categories.length > FLOOR_PLAN_LIMITS.maxCategories) {
      error(
        "too-many-categories",
        `A plan can have at most ${FLOOR_PLAN_LIMITS.maxCategories} categories.`,
        "categories"
      );
    }

    input.categories.forEach((raw, index) => {
      const path = `categories[${index}]`;
      if (!isRecord(raw)) {
        categoryIdsByIndex[index] = undefined;
        error("invalid-category", "Category must be an object.", path);
        return;
      }

      const id = raw.id;
      categoryIdsByIndex[index] = typeof id === "string" ? id : undefined;
      if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        error("invalid-id", `Category id must match ${ID_PATTERN}.`, `${path}.id`);
      } else if (categoryIds.has(id)) {
        error("duplicate-id", `Category id "${id}" is duplicated.`, `${path}.id`);
      } else {
        categoryIds.add(id);
      }

      const name = raw.name;
      if (typeof name !== "string" || name.trim().length === 0) {
        error("invalid-name", "Category name must be a non-empty string.", `${path}.name`);
      } else if (name.trim().length > FLOOR_PLAN_LIMITS.maxCategoryNameLength) {
        error(
          "invalid-name",
          `Category name must be at most ${FLOOR_PLAN_LIMITS.maxCategoryNameLength} characters.`,
          `${path}.name`
        );
      } else if (typeof id === "string") {
        categoryNames.set(id, { name: name.trim(), index });
      }

      const color = raw.color;
      if (typeof color !== "string" || !COLOR_PATTERN.test(color)) {
        error("invalid-color", "Category colour must be #RRGGBB.", `${path}.color`);
      } else {
        const normalized = color.toUpperCase();
        const owner = categoryColors.get(normalized);
        if (owner !== undefined) {
          warning(
            "category-color-duplicate",
            `Categories "${owner}" and ${typeof name === "string" ? `"${name}"` : "another category"} share the colour ${normalized}; colour alone is not a unique identifier.`,
            `${path}.color`
          );
        } else {
          categoryColors.set(normalized, typeof name === "string" ? name : "another category");
        }
      }

      const shortLabel = raw.shortLabel;
      const labelLength = typeof shortLabel === "string" ? [...shortLabel].length : 0;
      if (labelLength < 1 || labelLength > FLOOR_PLAN_LIMITS.maxShortLabelLength) {
        error(
          "invalid-short-label",
          `Category short label must be 1–${FLOOR_PLAN_LIMITS.maxShortLabelLength} characters.`,
          `${path}.shortLabel`
        );
      } else if (typeof shortLabel === "string" && /\s/.test(shortLabel)) {
        error(
          "invalid-short-label",
          "Category short label must not contain whitespace.",
          `${path}.shortLabel`
        );
      } else if (typeof shortLabel === "string") {
        const normalized = shortLabel.toUpperCase();
        const owner = categoryShortLabels.get(normalized);
        if (owner !== undefined) {
          warning(
            "category-short-label-duplicate",
            `Categories "${owner}" and "${typeof name === "string" ? name : "another category"}" share the short label "${normalized}".`,
            `${path}.shortLabel`
          );
        } else {
          categoryShortLabels.set(normalized, typeof name === "string" ? name : "another category");
        }
      }

      const pattern = raw.pattern;
      if (typeof pattern !== "string" || !CELL_PATTERNS.includes(pattern as CellPattern)) {
        error(
          "invalid-pattern",
          `Category pattern must be one of ${CELL_PATTERNS.join(", ")}.`,
          `${path}.pattern`
        );
      }
    });
  }

  // Floors -----------------------------------------------------------------
  const floorIds = new Set<string>();
  const floorNames = new Map<string, string>();
  const usedCategories = new Set<string>();

  if (!Array.isArray(input.floors)) {
    error("invalid-floors", "floors must be an array.", "floors");
  } else {
    if (input.floors.length < 1) {
      error("no-floors", "A plan must have at least one floor.", "floors");
    }
    if (input.floors.length > FLOOR_PLAN_LIMITS.maxFloors) {
      error(
        "too-many-floors",
        `A plan can have at most ${FLOOR_PLAN_LIMITS.maxFloors} floors.`,
        "floors"
      );
    }

    input.floors.forEach((raw, floorIndex) => {
      const path = `floors[${floorIndex}]`;
      if (!isRecord(raw)) {
        error("invalid-floor", "Floor must be an object.", path);
        return;
      }

      const id = raw.id;
      if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        error("invalid-id", `Floor id must match ${ID_PATTERN}.`, `${path}.id`);
      } else if (floorIds.has(id)) {
        error("duplicate-id", `Floor id "${id}" is duplicated.`, `${path}.id`);
      } else {
        floorIds.add(id);
      }

      const name = raw.name;
      if (typeof name !== "string" || name.trim().length === 0) {
        error("invalid-name", "Floor name must be a non-empty string.", `${path}.name`);
      } else if (name.trim().length > FLOOR_PLAN_LIMITS.maxFloorNameLength) {
        error(
          "invalid-name",
          `Floor name must be at most ${FLOOR_PLAN_LIMITS.maxFloorNameLength} characters.`,
          `${path}.name`
        );
      } else {
        const key = name.trim().toLowerCase();
        const owner = floorNames.get(key);
        if (owner !== undefined) {
          warning(
            "floor-name-duplicate",
            `Floors "${owner}" and "${name.trim()}" have the same name.`,
            `${path}.name`
          );
        } else {
          floorNames.set(key, name.trim());
        }
      }

      const rows = raw.rows;
      const rowsValid =
        typeof rows === "number" &&
        Number.isInteger(rows) &&
        rows >= FLOOR_PLAN_LIMITS.minRows &&
        rows <= FLOOR_PLAN_LIMITS.maxRows;
      if (!rowsValid) {
        error(
          "invalid-dimensions",
          `rows must be an integer between ${FLOOR_PLAN_LIMITS.minRows} and ${FLOOR_PLAN_LIMITS.maxRows}.`,
          `${path}.rows`
        );
      }

      const cols = raw.cols;
      const colsValid =
        typeof cols === "number" &&
        Number.isInteger(cols) &&
        cols >= FLOOR_PLAN_LIMITS.minCols &&
        cols <= FLOOR_PLAN_LIMITS.maxCols;
      if (!colsValid) {
        error(
          "invalid-dimensions",
          `cols must be an integer between ${FLOOR_PLAN_LIMITS.minCols} and ${FLOOR_PLAN_LIMITS.maxCols}.`,
          `${path}.cols`
        );
      }

      const cells = raw.cells;
      if (!Array.isArray(cells)) {
        error("invalid-cells", "Floor cells must be a two-dimensional array.", `${path}.cells`);
        return;
      }
      if (rowsValid && cells.length !== rows) {
        error(
          "invalid-cells",
          `Floor must have ${rows} rows of cells (got ${cells.length}).`,
          `${path}.cells`
        );
      }

      // Schema v2 stores token rows; the decoder also accepts the expanded cell
      // objects so an in-memory plan stays valid input. `decodeFloorRows`
      // reports malformed tokens (unknown token, run of 0, negative or
      // non-integer run, overflowing run) as issues instead of throwing.
      let machineCount = 0;
      if (colsValid) {
        const decoded = decodeFloorRows(
          cells,
          cols,
          categoryIdsByIndex,
          `${path}.cells`,
          rowsValid ? rows : FLOOR_PLAN_LIMITS.maxRows
        );
        for (const issue of decoded.errors) errors.push(issue);
        if (decoded.cells) {
          for (const rowCells of decoded.cells) {
            for (const cell of rowCells) {
              if (cell.kind !== "machine") continue;
              machineCount += 1;
              usedCategories.add(cell.categoryId);
            }
          }
        }
      } else {
        // Columns are unknown, so token rows cannot be expanded into cells; the
        // machine scan still feeds the `floor-empty` and `category-unused`
        // warnings. Unknown indexes are not reported here because `decodeFloorRows`
        // already covers them on every floor whose dimensions are valid.
        const scanned = scanMachineReferences(cells, categoryIdsByIndex);
        machineCount = scanned.machineCount;
        for (const categoryId of scanned.categoryIds) usedCategories.add(categoryId);
      }

      if (machineCount === 0) {
        warning(
          "floor-empty",
          `Floor ${typeof name === "string" ? `"${name.trim()}"` : `"${String(id)}"`} has no equipment squares.`,
          path
        );
      }
    });
  }

  categoryNames.forEach((entry, id) => {
    if (!usedCategories.has(id)) {
      warning(
        "category-unused",
        `Category "${entry.name}" is not used by any machine square.`,
        `categories[${entry.index}]`
      );
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Serialization and migrations
// ---------------------------------------------------------------------------

/**
 * Serializes to a canonical JSON string: known fields only, fixed key order,
 * current schema version. Validation runs first so an invalid plan never
 * reaches storage.
 *
 * Since schema v2 each floor's `cells` is a list of token rows rather than a
 * list of cell objects (see `wire.ts`): `"e"`, `"v"`, `"m:<categoryIndex>"`,
 * `"m:<categoryIndex>:<label>"`, and `["e"|"v", n]` runs. The decoder expands
 * them back to the same `FloorCell[][]`, so this function is the only place
 * that knows about the wire shape.
 */
export function serializePlan(plan: GymFloorPlan): string {
  const result = validatePlan(plan);
  if (!result.valid) {
    const first = result.errors[0];
    throw new FloorPlanError(
      "invalid-plan",
      `Cannot serialize an invalid floor plan: ${first?.message ?? "unknown error"}`
    );
  }

  // Category tokens carry an index into this array, so the map is built from
  // the exact array that is written below.
  const categoryIndex = new Map<string, number>();
  plan.categories.forEach((category, index) => {
    categoryIndex.set(category.id, index);
  });

  const canonical = {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    title: plan.title,
    categories: plan.categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      shortLabel: category.shortLabel,
      pattern: category.pattern,
    })),
    floors: plan.floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      rows: floor.rows,
      cols: floor.cols,
      cells: encodeFloorCells(floor.cells, categoryIndex),
    })),
  };

  return JSON.stringify(canonical);
}

/**
 * Encodes a plan as the schema v3 **packed binary payload**.
 *
 * This is the byte API storage codes against: it is what a `BLOB` column holds
 * and what `decodePlanBytes` reads back. Validation runs first, exactly as in
 * `serializePlan`, so an invalid plan never reaches storage and the same
 * `FloorPlanError("invalid-plan")` is thrown.
 *
 * A plan with no machine labels pays zero label bytes; a plan with labels pays
 * only for the labels themselves (see the layout block in `wireBinary.ts`).
 */
export function encodePlanBytes(plan: GymFloorPlan): Uint8Array {
  const result = validatePlan(plan);
  if (!result.valid) {
    const first = result.errors[0];
    throw new FloorPlanError(
      "invalid-plan",
      `Cannot encode an invalid floor plan: ${first?.message ?? "unknown error"}`
    );
  }

  // Validate returns a typed plan only structurally: drop unknown fields here so
  // the payload cannot depend on a host extension.
  const canonical: GymFloorPlan = {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    title: plan.title,
    categories: plan.categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      shortLabel: category.shortLabel,
      pattern: category.pattern,
    })),
    floors: plan.floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      rows: floor.rows,
      cols: floor.cols,
      cells: floor.cells,
    })),
  };

  return packPlanRecord(canonical);
}

/**
 * Decodes a schema v3 packed binary payload.
 *
 * Same contract as `parsePlanValue`: it never throws and returns
 * `{ ok: true, plan, warnings }` or `{ ok: false, issues }`. Structural problems
 * (wrong magic, wrong version, truncation, bad checksum, a label on a non
 * machine cell, an out-of-range category index, a category count that no longer
 * matches the declared bit width) are reported as issues; anything that decodes
 * structurally is then validated and materialized by the same code path the
 * string API uses, so both entry points accept and reject exactly the same
 * plans.
 *
 * Only the CURRENT binary version is accepted: v1 and v2 plans are JSON, so
 * they go through `deserializePlan` / `parsePlanValue`, which migrate them
 * forward.
 */
export function decodePlanBytes(bytes: Uint8Array | ArrayBuffer): DeserializeResult {
  const unpacked = unpackPlanRecord(bytes);
  if (!unpacked.ok) return unpacked;
  return parsePlanValue(unpacked.record);
}

type PlanMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Migration table keyed by the schema version each entry migrates FROM. */
export type PlanMigrationTable = Readonly<Record<number, PlanMigration>>;

/**
 * Migrations keyed by the version they migrate FROM.
 *
 * v1 -> v2 converts `cells` from arrays of cell objects to run-length encoded
 * token rows. The category index is the position of the v1 `categoryId` in the
 * plan's own `categories` array, so nothing is regenerated and category order
 * is preserved. A v1 record with an unknown `categoryId` is passed through
 * unconverted and then rejected by validation (`unknown-category`) — silently
 * dropping squares would lose owner data.
 *
 * v2 -> v3 decodes the token rows back into the expanded cell form (see
 * `migrateV2PlanRecord` in `wireBinary.ts`). v3 is the packed-binary schema, but
 * its JSON envelope is still the readable text form, so a stored v2 JSON plan
 * migrates to a v3 value that validates and packs without further steps.
 *
 * Adding a future schema version is a three-step change:
 *   1. bump `FLOOR_PLAN_SCHEMA_VERSION`;
 *   2. register `PLAN_MIGRATIONS[previousVersion]` returning the new shape;
 *   3. extend validation for the new fields.
 * Old stored plans then migrate on read, before validation.
 */
const PLAN_MIGRATIONS: PlanMigrationTable = {
  1: migrateV1PlanRecord,
  2: migrateV2PlanRecord,
};

/**
 * Reports a floor whose `cells` array carries more rows than its `rows` field
 * declares, BEFORE any migration touches it.
 *
 * Why this has to run on the raw record: `decodeFloorRows` deliberately stops at
 * `maxRows` instead of expanding untrusted surplus rows, and `migrateV1PlanRecord`
 * / `migrateV2PlanRecord` re-emit that truncated grid as the whole floor. The
 * later `cells.length !== rows` check in `validatePlan` then compares the
 * declared count against the already-truncated array, agrees with itself, and a
 * corrupt legacy plan loads as a complete one with its extra squares silently
 * discarded. A v3 record with the same shape is rejected, so the migrations must
 * not be a way around that check.
 *
 * Only the row count is inspected here — every other shape decision stays in
 * `validatePlan`, which runs on the migrated value and reports with its usual
 * codes and paths. Never throws.
 */
function findOverDeclaredRowCounts(raw: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const floors = raw.floors;
  if (!Array.isArray(floors)) return issues;

  floors.forEach((floor, index) => {
    if (!isRecord(floor)) return;
    const rows = floor.rows;
    const cells = floor.cells;
    if (!Array.isArray(cells)) return;
    if (typeof rows !== "number" || !Number.isInteger(rows)) return;
    if (cells.length <= rows) return;

    issues.push(
      validationIssue(
        "error",
        "invalid-cells",
        `Floor must have ${rows} rows of cells (got ${cells.length}).`,
        `floors[${index}].cells`
      )
    );
  });

  return issues;
}

function migratePlan(
  raw: unknown,
  migrations: PlanMigrationTable
): { ok: true; value: unknown } | { ok: false; issues: ValidationIssue[] } {
  if (!isRecord(raw)) {
    return {
      ok: false,
      issues: [validationIssue("error", "not-an-object", "Floor plan must be a JSON object.")],
    };
  }

  const version = raw.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return {
      ok: false,
      issues: [
        validationIssue(
          "error",
          "invalid-schema-version",
          `schemaVersion must be an integer (got ${describeValue(version)}).`,
          "schemaVersion"
        ),
      ],
    };
  }

  if (version > FLOOR_PLAN_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        validationIssue(
          "error",
          "unsupported-schema-version",
          `Plan schema version ${version} is newer than this module supports (${FLOOR_PLAN_SCHEMA_VERSION}). Update the module before loading it.`,
          "schemaVersion"
        ),
      ],
    };
  }

  let current = raw;
  let currentVersion = version;
  while (currentVersion < FLOOR_PLAN_SCHEMA_VERSION) {
    const migration = migrations[currentVersion];
    if (!migration) {
      return {
        ok: false,
        issues: [
          validationIssue(
            "error",
            "missing-migration",
            `No migration registered from schema version ${currentVersion} to ${currentVersion + 1}.`,
            "schemaVersion"
          ),
        ],
      };
    }
    // Checked per step, on the record the step is about to truncate: a v1 -> v2
    // -> v3 chain must not lose rows at either hop.
    const overDeclared = findOverDeclaredRowCounts(current);
    if (overDeclared.length > 0) return { ok: false, issues: overDeclared };

    current = migration(current);
    currentVersion += 1;
  }

  return { ok: true, value: current };
}

/**
 * Validates and migrates an already-parsed value (for hosts that keep the plan
 * inside a larger JSON blob, like NexusFit's `gym_config`).
 *
 * `migrations` is normally omitted: the module ships its own table. The
 * parameter exists so tests can exercise the migration loop and so a host with
 * a custom schema lineage can supply its own table.
 */
/**
 * Rebuilds a typed `GymFloorPlan` from a validated v2 record.
 *
 * Validation ran first, so every field below is the right type and every token
 * decodes; the decoder is called anyway and its (empty) error list is returned
 * so a logic error cannot silently produce a scrambled grid. Only known fields
 * survive, which keeps `parsePlanValue` symmetric with `serializePlan`.
 */
function materializePlan(
  raw: Record<string, unknown>
): { ok: true; plan: GymFloorPlan } | { ok: false; issues: ValidationIssue[] } {
  const rawCategories = raw.categories as Record<string, unknown>[];
  const categoryIdsByIndex = rawCategories.map((category) =>
    typeof category.id === "string" ? category.id : undefined
  );

  const categories: Category[] = rawCategories.map((category) => ({
    id: category.id as string,
    name: category.name as string,
    color: category.color as string,
    shortLabel: category.shortLabel as string,
    pattern: category.pattern as CellPattern,
  }));

  const issues: ValidationIssue[] = [];
  const floors: Floor[] = (raw.floors as Record<string, unknown>[]).map((floor, index) => {
    const decoded = decodeFloorRows(
      floor.cells as unknown[],
      floor.cols as number,
      categoryIdsByIndex,
      `floors[${index}].cells`,
      floor.rows as number
    );
    issues.push(...decoded.errors);
    return {
      id: floor.id as string,
      name: floor.name as string,
      rows: floor.rows as number,
      cols: floor.cols as number,
      cells: decoded.cells ?? [],
    };
  });

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    plan: {
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
      title: raw.title as string,
      categories,
      floors,
    },
  };
}

/**
 * Validates and migrates an already-parsed value (for hosts that keep the plan
 * inside a larger JSON blob, like NexusFit's `gym_config`).
 *
 * `migrations` is normally omitted: the module ships its own table. The
 * parameter exists so tests can exercise the migration loop and so a host with
 * a custom schema lineage can supply its own table.
 *
 * The returned plan is always the in-memory shape (`FloorCell[][]`), whatever
 * wire version was read: v1 records migrate to v2, then token rows expand.
 */
export function parsePlanValue(
  value: unknown,
  migrations: PlanMigrationTable = PLAN_MIGRATIONS
): DeserializeResult {
  const migrated = migratePlan(value, migrations);
  if (!migrated.ok) return migrated;

  const result = validatePlan(migrated.value);
  if (!result.valid) return { ok: false, issues: result.errors };

  const materialized = materializePlan(migrated.value as Record<string, unknown>);
  if (!materialized.ok) return materialized;

  return { ok: true, plan: materialized.plan, warnings: result.warnings };
}

export function deserializePlan(
  serialized: string,
  migrations: PlanMigrationTable = PLAN_MIGRATIONS
): DeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return {
      ok: false,
      issues: [validationIssue("error", "invalid-json", "Floor plan is not valid JSON.")],
    };
  }
  return parsePlanValue(parsed, migrations);
}
