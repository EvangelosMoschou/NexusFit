/**
 * Gym floor plan — schema v2 wire format (run-length encoded cells).
 *
 * The in-memory model stores a dense `FloorCell[][]` because that is what
 * rendering, resizing and painting want. That shape is a poor wire format: an
 * empty square costs 16 bytes of JSON (`{"kind":"empty"}`), and a realistic
 * plan is mostly empty floor and void. Schema v2 therefore serializes each
 * floor as `rows` arrays of *tokens*, while the in-memory model keeps the exact
 * same `FloorCell[][]` as before.
 *
 * Grammar (one array element per token, token order = left-to-right):
 *
 * | Token               | Meaning                                        |
 * | ------------------- | ---------------------------------------------- |
 * | `"e"`               | exactly one empty cell                         |
 * | `"v"`               | exactly one void cell                          |
 * | `"m:<index>"`       | one machine cell of `categories[index]`        |
 * | `"m:<index>:<text>` | one machine cell with a per-square label       |
 * | `["e", n]`          | `n` consecutive empty cells (an RLE run)       |
 * | `["v", n]`          | `n` consecutive void cells (an RLE run)        |
 *
 * Decisions worth knowing:
 *
 * - **Categories are referenced by index, not by id.** Painted cells no longer
 *   repeat `"cat-1"` (8 bytes) on every square; the categories array above
 *   carries the ids once. The index is the position in `plan.categories`, which
 *   is also display order, so it is already stable for a given plan.
 * - **Only `empty` and `void` are run-length encoded.** Machine cells usually
 *   differ in label and always matter individually, so they stay one short
 *   token each; a run of one is written as the bare token (`"e"`, 3 bytes)
 *   rather than `["e", 1]` (9 bytes).
 * - **The decoder expands to `FloorCell[][]`.** `deserializePlan` and
 *   `parsePlanValue` return exactly the same in-memory plan as schema v1 did,
 *   so no consumer of the model has to know about tokens.
 * - **The decoder also accepts the expanded form** (a full cell object such as
 *   `{"kind":"empty"}` or `{"kind":"machine","categoryId":"cat-1"}` in a v2
 *   row). That keeps `validatePlan(plan)` valid for an in-memory plan and lets
 *   a host hand-write a tiny fixture; the encoder never writes it.
 * - **Runs are exact.** A run of 1 is a token of 1, never 0, and never absorbs
 *   a neighbouring cell. A run that overflows the row is rejected instead of
 *   being clamped, so a corrupt file cannot silently reshape a floor.
 *
 * This file imports only from `types.ts`; `model.ts` imports it, never the
 * other way round.
 */

import {
  FLOOR_PLAN_LIMITS,
  type EmptyCell,
  type FloorCell,
  type MachineCell,
  type ValidationIssue,
  type VoidCell,
} from "./types";

/** Token for exactly one empty cell. */
export const EMPTY_CELL_TOKEN = "e";

/** Token for exactly one void cell. */
export const VOID_CELL_TOKEN = "v";

/** Prefix of a machine token: `m:<categoryIndex>` or `m:<categoryIndex>:<label>`. */
export const MACHINE_TOKEN_PREFIX = "m:";

/**
 * Shared immutable empty/void cells. The decoder returns these singletons, so a
 * decoded plan allocates only one object per machine cell.
 */
export const EMPTY_CELL: Readonly<EmptyCell> = Object.freeze({ kind: "empty" });
export const VOID_CELL: Readonly<VoidCell> = Object.freeze({ kind: "void" });

/**
 * One encoded cell: a single-cell token string, or a `[kind, length]` run.
 * `unknown` never appears here; the decoder accepts `unknown` because it parses
 * untrusted input.
 */
export type EncodedCellToken = string | [string, number];

/** A row of the v2 wire format. */
export type EncodedCellRow = EncodedCellToken[];

const MACHINE_TOKEN = /^m:(\d+)(?::([\s\S]*))?$/;
const RUN_KINDS: readonly string[] = [EMPTY_CELL_TOKEN, VOID_CELL_TOKEN];

/** Maximum number of characters allowed in a per-square machine label. */
const MAX_LABEL_LENGTH = FLOOR_PLAN_LIMITS.maxCellLabelLength;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(describe).join(", ")}]`;
  return String(value);
}

function wireIssue(code: string, message: string, path?: string): ValidationIssue {
  return path === undefined
    ? { severity: "error", code, message }
    : { severity: "error", code, message, path };
}

/** `"m:3"` or `"m:3:Bench press"`. */
export function machineToken(categoryIndex: number, label?: string): string {
  return label === undefined
    ? `${MACHINE_TOKEN_PREFIX}${categoryIndex}`
    : `${MACHINE_TOKEN_PREFIX}${categoryIndex}:${label}`;
}

// ---------------------------------------------------------------------------
// Encoding (in-memory -> wire)
// ---------------------------------------------------------------------------

/**
 * Encodes one cell. Unknown categories cannot reach this function because
 * `serializePlan` validates first; the throw is an internal invariant, not a
 * user-facing validation path.
 */
function encodeCellToken(
  cell: FloorCell,
  categoryIndex: ReadonlyMap<string, number>,
  path: string
): EncodedCellToken {
  if (cell.kind === "empty") return EMPTY_CELL_TOKEN;
  if (cell.kind === "void") return VOID_CELL_TOKEN;
  const index = categoryIndex.get(cell.categoryId);
  if (index === undefined) {
    throw new Error(
      `Internal error: cannot encode a machine cell at ${path}; category "${cell.categoryId}" is not in the plan.`
    );
  }
  return machineToken(index, cell.label);
}

/**
 * Collapses adjacent `"e"`/`"v"` tokens into `[kind, length]` runs and leaves
 * every other token untouched. A run of one stays a bare token because that is
 * shorter in JSON (3 bytes vs 9).
 *
 * The output element type is intentionally `unknown` so the v1 migration can
 * reuse it while passing through malformed cells for validation to report.
 */
export function collapseEmptyAndVoidRuns(tokens: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  let runToken: string | null = null;
  let runLength = 0;

  const flush = () => {
    if (runToken === null) return;
    out.push(runLength === 1 ? runToken : [runToken, runLength]);
    runToken = null;
    runLength = 0;
  };

  for (const token of tokens) {
    if (token === EMPTY_CELL_TOKEN || token === VOID_CELL_TOKEN) {
      if (token === runToken) {
        runLength += 1;
      } else {
        flush();
        runToken = token;
        runLength = 1;
      }
      continue;
    }
    flush();
    out.push(token);
  }
  flush();
  return out;
}

/**
 * Encodes a whole floor's cells. `categoryIndex` maps a category id to its
 * position in `plan.categories`.
 */
export function encodeFloorCells(
  cells: readonly (readonly FloorCell[])[],
  categoryIndex: ReadonlyMap<string, number>
): EncodedCellRow[] {
  return cells.map((rowCells, rowIndex) => {
    const tokens = rowCells.map((cell, colIndex) =>
      encodeCellToken(cell, categoryIndex, `cells[${rowIndex}][${colIndex}]`)
    );
    return collapseEmptyAndVoidRuns(tokens) as EncodedCellToken[];
  });
}

// ---------------------------------------------------------------------------
// Decoding (wire -> in-memory)
// ---------------------------------------------------------------------------

/** What a decoded run token means. */
interface DecodedRun {
  token: string;
  length: number;
}

function decodeLabel(label: string, path: string, errors: ValidationIssue[]): string | null {
  if (label.trim().length === 0 || label.trim().length > MAX_LABEL_LENGTH) {
    errors.push(
      wireIssue(
        "invalid-cell",
        `Machine label must be a non-empty string of at most ${MAX_LABEL_LENGTH} characters.`,
        path
      )
    );
    return null;
  }
  return label;
}

/** Decodes the expanded (non-RLE) cell object form. */
function decodeCellObject(
  raw: Record<string, unknown>,
  categoryIds: readonly (string | undefined)[],
  path: string,
  errors: ValidationIssue[]
): FloorCell | null {
  const kind = raw.kind;
  if (kind === "empty") return EMPTY_CELL;
  if (kind === "void") return VOID_CELL;
  if (kind !== "machine") {
    errors.push(
      wireIssue(
        "invalid-cell",
        `Cell kind must be "empty", "machine" or "void" (got ${describe(kind)}).`,
        path
      )
    );
    return null;
  }

  const categoryId = raw.categoryId;
  if (typeof categoryId !== "string" || categoryId.length === 0) {
    errors.push(wireIssue("invalid-cell", "Machine cell must reference a category id.", path));
    return null;
  }
  if (!categoryIds.includes(categoryId)) {
    errors.push(
      wireIssue(
        "unknown-category",
        `Machine cell references unknown category "${categoryId}".`,
        `${path}.categoryId`
      )
    );
    return null;
  }

  const label = raw.label;
  if (label === undefined) return { kind: "machine", categoryId };
  if (typeof label !== "string") {
    errors.push(
      wireIssue("invalid-cell", "Machine label must be a non-empty string.", `${path}.label`)
    );
    return null;
  }
  const validLabel = decodeLabel(label, `${path}.label`, errors);
  return validLabel === null
    ? null
    : ({ kind: "machine", categoryId, label: validLabel } satisfies MachineCell);
}

/** Decodes one single-cell token string. */
function decodeSingleToken(
  token: string,
  categoryIds: readonly (string | undefined)[],
  path: string,
  errors: ValidationIssue[]
): FloorCell | null {
  if (token === EMPTY_CELL_TOKEN) return EMPTY_CELL;
  if (token === VOID_CELL_TOKEN) return VOID_CELL;

  const machine = MACHINE_TOKEN.exec(token);
  if (machine) {
    const index = Number.parseInt(machine[1], 10);
    const categoryId = categoryIds[index];
    if (categoryId === undefined) {
      errors.push(
        wireIssue(
          "unknown-category",
          `Machine cell references category index ${index}, but the plan defines ${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}.`,
          path
        )
      );
      return null;
    }
    const rawLabel = machine[2];
    if (rawLabel === undefined) return { kind: "machine", categoryId };
    const label = decodeLabel(rawLabel, path, errors);
    return label === null ? null : { kind: "machine", categoryId, label };
  }

  errors.push(
    wireIssue(
      "invalid-cell",
      `Unknown cell token ${describe(token)}; expected "e", "v", "m:<categoryIndex>" or "m:<categoryIndex>:<label>".`,
      path
    )
  );
  return null;
}

/** Decodes one run token such as `["e", 12]`. */
function decodeRunToken(
  token: readonly unknown[],
  remainingCols: number,
  path: string,
  errors: ValidationIssue[]
): DecodedRun | null {
  if (token.length !== 2) {
    errors.push(
      wireIssue(
        "invalid-cells",
        `A run token must be a two-element array [kind, length] (got ${token.length} element(s)).`,
        path
      )
    );
    return null;
  }

  const kind = token[0];
  if (typeof kind !== "string" || !RUN_KINDS.includes(kind)) {
    const hint =
      typeof kind === "string" && kind.startsWith(MACHINE_TOKEN_PREFIX)
        ? " Machine cells cannot be run-length encoded."
        : "";
    errors.push(
      wireIssue(
        "invalid-cells",
        `Run kind must be "e" or "v" (got ${describe(kind)}).${hint}`,
        path
      )
    );
    return null;
  }

  const length = token[1];
  if (typeof length !== "number" || !Number.isInteger(length) || length < 1) {
    errors.push(
      wireIssue(
        "invalid-cells",
        `Run length must be a positive integer (got ${describe(length)}).`,
        path
      )
    );
    return null;
  }

  if (length > remainingCols) {
    errors.push(
      wireIssue(
        "invalid-cells",
        `Run of ${length} ${describe(kind)} cell(s) overflows the row: only ${remainingCols} column(s) remain.`,
        path
      )
    );
    return null;
  }

  return { token: kind, length };
}

function decodeRow(
  tokens: readonly unknown[],
  cols: number,
  categoryIds: readonly (string | undefined)[],
  rowPath: string,
  errors: ValidationIssue[]
): FloorCell[] | null {
  const cells: FloorCell[] = [];
  const errorsBefore = errors.length;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const tokenPath = `${rowPath}[${index}]`;

    if (Array.isArray(token)) {
      const run = decodeRunToken(token, cols - cells.length, tokenPath, errors);
      if (!run) continue;
      const template = run.token === EMPTY_CELL_TOKEN ? EMPTY_CELL : VOID_CELL;
      for (let step = 0; step < run.length; step += 1) cells.push(template);
      continue;
    }

    const cell =
      typeof token === "string"
        ? decodeSingleToken(token, categoryIds, tokenPath, errors)
        : isRecord(token)
          ? decodeCellObject(token, categoryIds, tokenPath, errors)
          : null;
    if (cell === null) {
      if (typeof token === "string" || isRecord(token)) continue;
      errors.push(
        wireIssue(
          "invalid-cells",
          `A cell must be a token string, a [kind, length] run or a cell object (got ${describe(token)}).`,
          tokenPath
        )
      );
      continue;
    }

    if (cells.length >= cols) {
      errors.push(
        wireIssue(
          "invalid-cells",
          `Row has more than ${cols} cells; the decoder stopped at ${describe(token)}.`,
          tokenPath
        )
      );
      return null;
    }
    cells.push(cell);
  }

  if (errors.length !== errorsBefore) return null;
  if (cells.length !== cols) {
    errors.push(
      wireIssue("invalid-cells", `Row must have ${cols} cells (got ${cells.length}).`, rowPath)
    );
    return null;
  }
  return cells;
}

/**
 * Decodes the `cells` value of one floor.
 *
 * Returns `cells: null` whenever any row produced an issue; the caller already
 * has the issues, so it only needs to know that no trustworthy grid exists.
 * `categoryIds` is indexed by category position and may contain `undefined` for
 * a category entry that itself failed validation (the index still lines up).
 *
 * At most `maxRows` rows are decoded. Validation already rejects a row count
 * that disagrees with the floor's `rows`, so the extra rows are untrusted
 * surplus and there is no reason to expand them (or their run tokens) at all.
 */
export function decodeFloorRows(
  rawRows: readonly unknown[],
  cols: number,
  categoryIds: readonly (string | undefined)[],
  path: string,
  maxRows: number = rawRows.length
): { cells: FloorCell[][] | null; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const cells: FloorCell[][] = [];

  for (let rowIndex = 0; rowIndex < rawRows.length && rowIndex < maxRows; rowIndex += 1) {
    const rawRow = rawRows[rowIndex];
    const rowPath = `${path}[${rowIndex}]`;
    if (!Array.isArray(rawRow)) {
      errors.push(wireIssue("invalid-cells", "Each cells row must be an array.", rowPath));
      continue;
    }
    const row = decodeRow(rawRow, cols, categoryIds, rowPath, errors);
    if (row !== null) cells.push(row);
  }

  return errors.length === 0 ? { cells, errors } : { cells: null, errors };
}

// ---------------------------------------------------------------------------
// v1 -> v2 migration
// ---------------------------------------------------------------------------

/**
 * Converts one v1 cell object to its v2 token, or returns an object that
 * validation will reject.
 *
 * Failures are deliberately NOT repaired here. A v1 plan may carry an unknown
 * category id or a malformed cell, and the only safe outcome is a validation
 * issue: silently dropping the square (or guessing a category) would lose owner
 * data. Returning `{ kind: <the offending value> }` keeps the decoder's error
 * path, which reports an actionable `invalid-cell` / `unknown-category` instead
 * of throwing.
 *
 * The non-record branch also stops a schema-v2 record that falsely claims
 * `schemaVersion: 1` from migrating through: v1 cells are objects, so a token
 * string like `"m:0"` is rejected as a bad cell kind rather than decoded.
 */
function migrateV1Cell(raw: unknown, categoryIndex: ReadonlyMap<string, number>): unknown {
  if (!isRecord(raw)) return { kind: raw };

  const kind = raw.kind;
  if (kind === "empty") return EMPTY_CELL_TOKEN;
  if (kind === "void") return VOID_CELL_TOKEN;
  if (kind !== "machine") return raw;

  const categoryId = raw.categoryId;
  if (typeof categoryId !== "string") return raw;
  const index = categoryIndex.get(categoryId);
  if (index === undefined) return raw;

  const label = raw.label;
  if (label === undefined) return machineToken(index);
  if (typeof label !== "string") return raw;
  return machineToken(index, label);
}

function migrateV1Floor(raw: unknown, categoryIndex: ReadonlyMap<string, number>): unknown {
  if (!isRecord(raw)) return raw;
  const cells = raw.cells;
  if (!Array.isArray(cells)) return raw;

  const rows = cells.map((row) =>
    Array.isArray(row)
      ? collapseEmptyAndVoidRuns(row.map((cell) => migrateV1Cell(cell, categoryIndex)))
      : row
  );
  return { ...raw, cells: rows };
}

/**
 * `PLAN_MIGRATIONS[1]`: schema v1 (`cells` as arrays of cell objects) to schema
 * v2 (run-length encoded token rows).
 *
 * The category INDEX comes from the position of the v1 `categoryId` in the
 * plan's own `categories` array, so category order is preserved exactly and no
 * id is regenerated. Malformed entries are passed through for validation rather
 * than repaired here.
 */
export function migrateV1PlanRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const categoryIndex = new Map<string, number>();
  categories.forEach((category, index) => {
    if (isRecord(category) && typeof category.id === "string") {
      categoryIndex.set(category.id, index);
    }
  });

  const floors = Array.isArray(raw.floors)
    ? raw.floors.map((floor) => migrateV1Floor(floor, categoryIndex))
    : raw.floors;

  return { ...raw, schemaVersion: 2, floors };
}

/**
 * Best-effort machine scan used by validation when the floor's `cols` is
 * already invalid: rows cannot be expanded into cells, but the machine count
 * and the referenced category ids still drive the `floor-empty` and
 * `category-unused` warnings, so they are worth recovering.
 *
 * Never throws. Unknown tokens, unknown category indexes and malformed objects
 * are simply not counted; the caller has already reported the dimension error
 * and `decodeFloorRows` handles token errors on well-formed floors.
 */
export function scanMachineReferences(
  rawRows: readonly unknown[],
  categoryIdsByIndex: readonly (string | undefined)[]
): {
  machineCount: number;
  categoryIds: Set<string>;
} {
  const categoryIds = new Set<string>();
  let machineCount = 0;

  for (const rawRow of rawRows) {
    if (!Array.isArray(rawRow)) continue;
    for (const token of rawRow) {
      if (isRecord(token)) {
        if (token.kind !== "machine" || typeof token.categoryId !== "string") continue;
        machineCount += 1;
        categoryIds.add(token.categoryId);
        continue;
      }
      if (typeof token !== "string") continue;
      const machine = MACHINE_TOKEN.exec(token);
      if (!machine) continue;
      machineCount += 1;
      const categoryId = categoryIdsByIndex[Number.parseInt(machine[1], 10)];
      if (categoryId !== undefined) categoryIds.add(categoryId);
    }
  }

  return { machineCount, categoryIds };
}
