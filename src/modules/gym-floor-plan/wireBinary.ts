/**
 * Gym floor plan — schema v3 packed binary wire format (the storage codec).
 *
 * Schema v2 (`wire.ts`) serializes each row as JSON tokens. That is readable,
 * but expensive: a machine square is `"m:0"` — five bytes of JSON punctuation
 * and quotes to carry two bits of information — and a realistic 40 x 40 x 6
 * plan costs ~44 KB of text. The 96 x 96 ceiling costs 2 370 bytes for an empty
 * floor and 3 388 bytes for a realistic one (measured by `render.test.ts`). Schema v3 packs the same plan into a binary blob
 * where a cell costs exactly `2 + categoryBits` bits.
 *
 * This file is the codec. It is deliberately split from `model.ts` so the
 * dependency direction stays one-way (`model.ts` -> `wire.ts` / `wireBinary.ts`
 * -> `types.ts`): the public, validating entry points `encodePlanBytes` and
 * `decodePlanBytes` live in `model.ts`, because they must reuse `validatePlan`
 * and `parsePlanValue`. This file never imports the host application, and never
 * imports `node:*`: the module stays portable.
 *
 * Layout
 * ======
 *
 * All multi-byte integers are BIG-ENDIAN. "varint" is unsigned LEB128 (base
 * 128, low 7 bits per byte, high bit = "another byte follows"). There is no
 * JSON, no zlib and no text framing in the payload.
 *
 *   offset size field
 *   0      2    magic "NF" (0x4E 0x46): a mis-fed blob fails loudly
 *   2      1    payload version (currently 3; a binary payload is only ever v3)
 *   3      1    flags: bit0 = HAS_LABELS, bits 1..7 reserved (must be 0)
 *   4      1    floorCount (1..6)
 *   5      1    categoryBits (1..5) = ceil(log2(max(2, categoryCount)))
 *   6      2    maxRows  = the largest floor's `rows`  (1..96)
 *   8      2    maxCols  = the largest floor's `cols`  (1..96)
 *   10     2    categoryCount
 *   12     2    labelCount (0 means the label section is absent entirely)
 *   14     4    total payload byte length, header included (truncation guard)
 *   18     4    FNV-1a 32-bit checksum of the body (bytes 24 .. end)
 *   22     2    reserved, must be 0
 *   --------    body starts at offset 24
 *   24     ...  title:                varint byteLength + UTF-8 bytes
 *          ...  categoryCount times:  varint+bytes id
 *                                     varint+bytes name
 *                                     3 bytes RGB (from "#RRGGBB")
 *                                     varint+bytes shortLabel
 *                                     1 byte pattern index into CELL_PATTERNS
 *          ...  floorCount times:     varint+bytes id
 *                                     varint+bytes name
 *                                     uint16 rows (BE)
 *                                     uint16 cols (BE)
 *                                     varint gridByteLength
 *                                     packed grid, that many bytes
 *          ...  labelCount times:     varint cellOrdinal
 *                                     varint byteLength
 *                                     UTF-8 label bytes
 *
 * Grid
 * ----
 * Row-major, `rows * cols` cells, bit-packed most-significant-bit first inside
 * each byte. Every cell starts with 2 kind bits:
 *
 *   0 = empty, 1 = void, 2 = machine, 3 = reserved (invalid)
 *
 * A **machine cell is immediately followed by `categoryBits` index bits**; empty
 * and void cells carry no index at all. That is the whole trick: the two bits
 * that actually differ between square kinds are all an empty square ever costs,
 * and the index bits appear only on the ~40% of a realistic plan that is
 * painted. Compared with a fixed `2 + categoryBits` stride this saves
 * `categoryBits * (1 - machineFraction)` bits per cell — ~20% of the grid at a
 * typical 40% machine density, and the majority of it on a mostly-open plan.
 *
 * The index width is still chosen ONCE per plan from `categories.length` and
 * recorded in the header, so a plan with one category pays 1 index bit rather
 * than 5. Because the grid is now a sequential bit stream its byte length
 * depends on the machine count, so each floor carries an explicit
 * `gridByteLength` varint (2 bytes for a maximal floor). The decoder reads
 * exactly that many bytes and requires the leftover bits of the last byte to be
 * zero padding, which makes a hand-edited grid length an issue rather than a
 * silent desync. As an upper bound `gridByteLength(rows, cols, bits)` =
 * `ceil(rows * cols * (2 + bits) / 8)` is used to reject an over-long
 * declaration BEFORE allocating (see `MAX` note below).
 *
 * The cost of the sequential stream is that a cell cannot be addressed without
 * walking from the start of its floor. That is fine for the module's use: a
 * decode is a full-plan decode anyway (the editor holds a whole floor).
 *
 * Labels (the side table)
 * -----------------------
 * A per-square machine label ("Lat pulldown") must not inflate every cell, so
 * labels are NOT in the grid. They are a side table after the floors:
 *
 *   cellOrdinal = offsetOfFloor + row * cols + col
 *
 * where `offsetOfFloor` is the sum of `rows * cols` of the floors before it, so
 * an ordinal is a single varint rather than a (floor, row, col) triple. At the
 * 96 x 96 x 6 ceiling the largest ordinal is 55 295, which a varint encodes in
 * 3 bytes (2 bytes cover up to 16 383 cells). Entries are written in ascending
 * cell order.
 *
 * Consequence worth testing: a plan with no labels writes labelCount = 0, the
 * HAS_LABELS flag stays clear and the payload carries ZERO label bytes — not a
 * count prefix and not a per-cell "has label" bit.
 *
 * Integrity
 * ---------
 * Three independent guards, all cheap:
 *   1. magic + version + reserved/flags: a blob from another feature, another
 *      schema, or a hand-edited header is rejected by name;
 *   2. the declared total length must equal the actual byte length, so a
 *      truncated (or over-long) payload is caught BEFORE any per-floor
 *      allocation, not after a crash;
 *   3. an FNV-1a 32-bit checksum over the body, so a flipped cell bit is an
 *      `invalid-binary-checksum` issue instead of a silently different gym.
 *
 * Nothing in this file throws for untrusted input: the decoders raise a private
 * `BinaryReadError` carrying `ValidationIssue`s, which `unpackPlanRecord`
 * catches and returns. The only throws are `Error`s for internal invariants in
 * the packer, which validation has already ruled out on the public path.
 */

import {
  CELL_PATTERNS,
  FLOOR_PLAN_LIMITS,
  FLOOR_PLAN_SCHEMA_VERSION,
  type Category,
  type CellPattern,
  type FloorCell,
  type GymFloorPlan,
  type ValidationIssue,
} from "./types";
import { EMPTY_CELL, VOID_CELL, decodeFloorRows, encodeFloorCells } from "./wire";

/** Two magic bytes at the start of every payload: ASCII "NF" (NexusFit). */
export const PLAN_BINARY_MAGIC = 0x4e46;

/** Payload version. Binary payloads only exist at the current schema version. */
export const PLAN_BINARY_VERSION = FLOOR_PLAN_SCHEMA_VERSION;

/** Size of the fixed header; the body starts at this offset. */
export const PLAN_BINARY_HEADER_BYTES = 24;

/** Bits used by the cell kind (empty / void / machine / reserved). */
export const CELL_KIND_BITS = 2;

/** Cell kind codes, in the order the 2 kind bits encode them. */
export const CELL_KIND_CODE = {
  empty: 0,
  void: 1,
  machine: 2,
} as const;

const KIND_EMPTY = CELL_KIND_CODE.empty;
const KIND_VOID = CELL_KIND_CODE.void;
const KIND_MACHINE = CELL_KIND_CODE.machine;
const KIND_RESERVED = 3;

/** Header flag: at least one label is present, so the label section exists. */
const FLAG_HAS_LABELS = 0x01;

/**
 * Maximum UTF-8 bytes accepted for one identifier/name/title. The longest
 * legal field is the 80-character plan title, which is at most 4 bytes per
 * character; anything longer is corrupt and is rejected before decoding it.
 */
const MAX_STRING_BYTES = 4 * FLOOR_PLAN_LIMITS.maxPlanTitleLength;

/** Maximum UTF-8 bytes accepted for one machine label (40 characters). */
const MAX_LABEL_BYTES = 4 * FLOOR_PLAN_LIMITS.maxCellLabelLength;

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Issue raised by the binary decoders; never escapes `unpackPlanRecord`. */
class BinaryReadError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issue: ValidationIssue) {
    super(issue.message);
    this.name = "BinaryReadError";
    this.issues = [issue];
  }
}

function binaryIssue(code: string, message: string, path?: string): ValidationIssue {
  return path === undefined
    ? { severity: "error", code, message }
    : { severity: "error", code, message, path };
}

function fail(code: string, message: string, path?: string): never {
  throw new BinaryReadError(binaryIssue(code, message, path));
}

/** Internal invariant: the packer was handed something validation rules out. */
function invariant(message: string): never {
  throw new Error(`Internal error: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

/**
 * Bit width of the category index for a plan with `categoryCount` categories.
 *
 * `max(2, ...)` keeps the width at 1 bit even for a plan with zero or one
 * category: 1 bit has two slots, and 0 bits would make the cell stride depend
 * on the plan in a way the header could not express.
 */
export function categoryBitWidth(categoryCount: number): number {
  const slots = Math.max(2, Math.trunc(categoryCount));
  let bits = 1;
  while (2 ** bits < slots) bits += 1;
  return bits;
}

/**
 * Upper bound on one floor's packed grid: every cell machine, padding included.
 *
 * The real length is smaller (empty/void cells carry no index bits) and is
 * written into the payload as a varint. This bound exists so a corrupt header
 * can be rejected before anything is allocated: no floor can legitimately
 * declare more than this.
 */
export function maxGridByteLength(rows: number, cols: number, categoryBits: number): number {
  return Math.ceil((rows * cols * (CELL_KIND_BITS + categoryBits)) / 8);
}

/** Exact packed length of one floor's grid, padding included. */
export function gridByteLength(
  cells: readonly (readonly FloorCell[])[],
  categoryBits: number
): number {
  let bits = 0;
  for (const rowCells of cells) {
    for (const cell of rowCells) {
      bits += CELL_KIND_BITS;
      if (cell.kind === "machine") bits += categoryBits;
    }
  }
  return Math.ceil(bits / 8);
}

// ---------------------------------------------------------------------------
// Bit packing
// ---------------------------------------------------------------------------

/**
 * Packs one floor's cells row-major: 2 kind bits per cell, plus `categoryBits`
 * index bits immediately after a machine cell.
 *
 * Exported for the size regression tests and for hosts that want to pack a
 * single floor. Unknown category ids are an internal invariant: every public
 * path validates the plan first.
 */
export function packCellGrid(
  cells: readonly (readonly FloorCell[])[],
  categoryBits: number,
  categoryIndex: ReadonlyMap<string, number>
): Uint8Array {
  const out: number[] = [];
  let current = 0;
  let used = 0;

  const writeBits = (value: number, width: number): void => {
    for (let bit = width - 1; bit >= 0; bit -= 1) {
      current = (current << 1) | ((value >>> bit) & 1);
      used += 1;
      if (used === 8) {
        out.push(current);
        current = 0;
        used = 0;
      }
    }
  };

  for (const rowCells of cells) {
    for (const cell of rowCells) {
      if (cell.kind === "empty") {
        writeBits(KIND_EMPTY, CELL_KIND_BITS);
        continue;
      }
      if (cell.kind === "void") {
        writeBits(KIND_VOID, CELL_KIND_BITS);
        continue;
      }
      const index = categoryIndex.get(cell.categoryId);
      if (index === undefined) {
        invariant(
          `cannot pack a machine cell whose category "${cell.categoryId}" is not in the plan.`
        );
      }
      if (index >= 2 ** categoryBits) {
        invariant(`category index ${index} does not fit in ${categoryBits} bit(s).`);
      }
      writeBits(KIND_MACHINE, CELL_KIND_BITS);
      writeBits(index, categoryBits);
    }
  }

  if (used > 0) {
    out.push((current << (8 - used)) & 0xff);
  }
  return Uint8Array.from(out);
}

/** Reads bits MSB-first; overrun becomes a validation issue, never a crash. */
class BitReader {
  private bit = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get bitLength(): number {
    return this.bytes.byteLength * 8;
  }

  read(width: number, path: string): number {
    let value = 0;
    for (let step = 0; step < width; step += 1) {
      if (this.bit >= this.bitLength) {
        fail(
          "invalid-binary-length",
          `The packed cell grid for ${path} ends before the last cell; the declared grid length is too short for its own contents.`,
          path
        );
      }
      const byte = this.bytes[this.bit >>> 3];
      const bit = (byte >>> (7 - (this.bit & 7))) & 1;
      value = (value << 1) | bit;
      this.bit += 1;
    }
    return value;
  }

  /**
   * True when only zero padding remains before the next byte boundary.
   *
   * The packer pads the last byte of a grid with zero bits, so anything else
   * means the declared grid length does not match the cells it is supposed to
   * hold. Checked once per floor, after its last cell.
   */
  hasOnlyZeroPadding(): boolean {
    for (let position = this.bit; position < this.bitLength; position += 1) {
      const byte = this.bytes[position >>> 3];
      if (((byte >>> (7 - (position & 7))) & 1) !== 0) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Byte writing / reading
// ---------------------------------------------------------------------------

class ByteWriter {
  private readonly out: number[] = [];

  u8(value: number): void {
    this.out.push(value & 0xff);
  }

  u16(value: number): void {
    this.out.push((value >>> 8) & 0xff, value & 0xff);
  }

  u32(value: number): void {
    this.out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  bytes(value: Uint8Array): void {
    for (const byte of value) this.out.push(byte);
  }

  /** Unsigned LEB128. */
  varint(value: number): void {
    let rest = Math.trunc(value);
    if (!Number.isSafeInteger(rest) || rest < 0) invariant(`cannot varint-encode ${value}.`);
    while (rest >= 0x80) {
      this.out.push((rest & 0x7f) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.out.push(rest);
  }

  /** varint byte length + UTF-8 bytes. */
  string(value: string): void {
    const encoded = UTF8_ENCODER.encode(value);
    this.varint(encoded.length);
    this.bytes(encoded);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

class ByteReader {
  private offset: number;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = PLAN_BINARY_HEADER_BYTES;
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  private require(length: number, what: string): void {
    if (length > this.remaining) {
      fail(
        "invalid-binary-length",
        `The payload ends while reading the ${what}: ${length} byte(s) needed, ${Math.max(0, this.remaining)} available.`
      );
    }
  }

  u8(what: string): number {
    this.require(1, what);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(what: string): number {
    this.require(2, what);
    const value = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return value;
  }

  bytesAt(length: number, what: string): Uint8Array {
    this.require(length, what);
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  varint(what: string): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.u8(what);
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) fail("invalid-binary-body", `A varint in the ${what} is too long.`);
    }
    if (!Number.isSafeInteger(result)) {
      fail("invalid-binary-body", `A varint in the ${what} is out of range.`);
    }
    return result;
  }

  string(what: string, maxBytes: number): string {
    const length = this.varint(what);
    if (length > maxBytes) {
      fail(
        "invalid-binary-body",
        `The ${what} declares ${length} byte(s); the maximum is ${maxBytes}.`
      );
    }
    return decodeUtf8(this.bytesAt(length, what), what);
  }
}

function decodeUtf8(bytes: Uint8Array, what: string): string {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    fail("invalid-binary-body", `The ${what} is not valid UTF-8.`);
  }
}

// ---------------------------------------------------------------------------
// Framing helpers
// ---------------------------------------------------------------------------

function toBytes(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return fail(
    "invalid-binary",
    "decodePlanBytes expects a Uint8Array or an ArrayBuffer; received a different value."
  );
}

/** FNV-1a over `bytes[start .. end)`, returned as an unsigned 32-bit integer. */
export function fnv1a32(bytes: Uint8Array, start = 0): number {
  let hash = 0x811c9dc5;
  for (let index = start; index < bytes.byteLength; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function rgbBytes(color: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) invariant(`cannot pack the category colour ${JSON.stringify(color)}.`);
  return [
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  ];
}

function patternCode(pattern: CellPattern): number {
  const index = CELL_PATTERNS.indexOf(pattern);
  if (index < 0) invariant(`cannot pack the unknown pattern ${JSON.stringify(pattern)}.`);
  return index;
}

// ---------------------------------------------------------------------------
// Plan record -> bytes (structure only; validation happens in model.ts)
// ---------------------------------------------------------------------------

/**
 * Packs a plan into the v3 payload. This is the structural encoder: it assumes
 * `validatePlan(plan)` passed. `encodePlanBytes` in `model.ts` is the public
 * entry point and validates first.
 */
export function packPlanRecord(plan: GymFloorPlan): Uint8Array {
  const floorCount = plan.floors.length;
  if (floorCount < 1 || floorCount > 0xff) {
    invariant(`cannot pack ${floorCount} floor(s).`);
  }
  if (plan.categories.length > 0xffff) {
    invariant(`cannot pack ${plan.categories.length} categories.`);
  }

  const categoryIndex = new Map<string, number>();
  plan.categories.forEach((category, index) => categoryIndex.set(category.id, index));
  const categoryBits = categoryBitWidth(plan.categories.length);

  const body = new ByteWriter();
  body.string(plan.title);

  for (const category of plan.categories) {
    body.string(category.id);
    body.string(category.name);
    const [red, green, blue] = rgbBytes(category.color);
    body.u8(red);
    body.u8(green);
    body.u8(blue);
    body.string(category.shortLabel);
    body.u8(patternCode(category.pattern));
  }

  /** Label side table, in ascending cell-ordinal order. */
  const labels: Array<{ ordinal: number; bytes: Uint8Array }> = [];
  let ordinalBase = 0;
  let maxRows = 0;
  let maxCols = 0;

  for (const floor of plan.floors) {
    if (floor.cells.length !== floor.rows) {
      invariant(
        `floor "${floor.id}" declares ${floor.rows} row(s) but carries ${floor.cells.length}.`
      );
    }
    for (const rowCells of floor.cells) {
      if (rowCells.length !== floor.cols) {
        invariant(
          `floor "${floor.id}" declares ${floor.cols} column(s) but a row carries ${rowCells.length}.`
        );
      }
    }

    body.string(floor.id);
    body.string(floor.name);
    body.u16(floor.rows);
    body.u16(floor.cols);
    const grid = packCellGrid(floor.cells, categoryBits, categoryIndex);
    body.varint(grid.byteLength);
    body.bytes(grid);

    floor.cells.forEach((rowCells, row) => {
      rowCells.forEach((cell, col) => {
        if (cell.kind !== "machine" || cell.label === undefined) return;
        labels.push({
          ordinal: ordinalBase + row * floor.cols + col,
          bytes: UTF8_ENCODER.encode(cell.label),
        });
      });
    });

    ordinalBase += floor.rows * floor.cols;
    maxRows = Math.max(maxRows, floor.rows);
    maxCols = Math.max(maxCols, floor.cols);
  }

  if (labels.length > 0xffff) invariant(`cannot pack ${labels.length} labels.`);
  for (const label of labels) {
    body.varint(label.ordinal);
    body.varint(label.bytes.length);
    body.bytes(label.bytes);
  }

  const bodyBytes = body.toUint8Array();
  const totalLength = PLAN_BINARY_HEADER_BYTES + bodyBytes.byteLength;
  if (totalLength > 0xffffffff) invariant(`the packed plan is ${totalLength} bytes.`);

  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);
  out[0] = 0x4e;
  out[1] = 0x46;
  out[2] = PLAN_BINARY_VERSION;
  out[3] = labels.length > 0 ? FLAG_HAS_LABELS : 0;
  out[4] = floorCount;
  out[5] = categoryBits;
  view.setUint16(6, maxRows, false);
  view.setUint16(8, maxCols, false);
  view.setUint16(10, plan.categories.length, false);
  view.setUint16(12, labels.length, false);
  view.setUint32(14, totalLength, false);
  out.set(bodyBytes, PLAN_BINARY_HEADER_BYTES);
  view.setUint32(18, fnv1a32(out, PLAN_BINARY_HEADER_BYTES), false);
  // Bytes 22..23 stay zero: reserved.

  return out;
}

// ---------------------------------------------------------------------------
// Bytes -> plan record (structure only; validation happens in model.ts)
// ---------------------------------------------------------------------------

/** Result of the structural decode: a v3 plan record, or validation issues. */
export type UnpackedPlanRecord =
  { ok: true; record: Record<string, unknown> } | { ok: false; issues: ValidationIssue[] };

/**
 * Decodes a v3 payload into a plain plan record (`cells` as expanded cell
 * objects) without validating it. `decodePlanBytes` in `model.ts` runs the
 * result through `parsePlanValue`, which is what turns these structural checks
 * plus the model's own rules into the caller-facing `DeserializeResult`.
 *
 * Never throws, whatever it is handed.
 */
export function unpackPlanRecord(input: Uint8Array | ArrayBuffer): UnpackedPlanRecord {
  try {
    return { ok: true, record: decodeRecord(toBytes(input)) };
  } catch (error) {
    if (error instanceof BinaryReadError) return { ok: false, issues: error.issues };
    return {
      ok: false,
      issues: [
        binaryIssue(
          "invalid-binary",
          "The binary floor plan payload could not be decoded; it is not a schema v3 payload."
        ),
      ],
    };
  }
}

function decodeRecord(bytes: Uint8Array): Record<string, unknown> {
  const byteLength = bytes.byteLength;
  if (byteLength < PLAN_BINARY_HEADER_BYTES) {
    fail(
      "invalid-binary-header",
      `A binary floor plan is at least ${PLAN_BINARY_HEADER_BYTES} bytes; received ${byteLength}.`
    );
  }
  if (bytes[0] !== 0x4e || bytes[1] !== 0x46) {
    fail(
      "invalid-binary-header",
      `Not a floor-plan payload: expected the magic bytes "NF" (0x4E 0x46), received 0x${hexByte(bytes[0])} 0x${hexByte(bytes[1])}.`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, byteLength);
  const version = bytes[2];
  if (version !== PLAN_BINARY_VERSION) {
    fail(
      "unsupported-schema-version",
      version > PLAN_BINARY_VERSION
        ? `Binary payload version ${version} is newer than this module supports (${PLAN_BINARY_VERSION}). Update the module before reading it.`
        : `Binary payload version ${version} is not supported: only version ${PLAN_BINARY_VERSION} has a binary form. Schema v1 and v2 plans are JSON — read them with deserializePlan or parsePlanValue.`
    );
  }

  const flags = bytes[3];
  if ((flags & ~FLAG_HAS_LABELS) !== 0) {
    fail(
      "invalid-binary-header",
      `Unsupported header flags 0x${hexByte(flags)}: only bit0 (has labels) is defined.`
    );
  }
  if (view.getUint16(22, false) !== 0) {
    fail("invalid-binary-header", "The reserved header bytes must be zero.");
  }

  const floorCount = bytes[4];
  if (floorCount < 1 || floorCount > FLOOR_PLAN_LIMITS.maxFloors) {
    fail(
      "invalid-binary-header",
      `A plan must have between 1 and ${FLOOR_PLAN_LIMITS.maxFloors} floors; the header declares ${floorCount}.`
    );
  }

  const categoryBits = bytes[5];
  const maxRows = view.getUint16(6, false);
  const maxCols = view.getUint16(8, false);
  const categoryCount = view.getUint16(10, false);
  const labelCount = view.getUint16(12, false);
  const declaredLength = view.getUint32(14, false);
  const checksum = view.getUint32(18, false);

  if (categoryCount > FLOOR_PLAN_LIMITS.maxCategories) {
    fail(
      "invalid-binary-header",
      `A plan can have at most ${FLOOR_PLAN_LIMITS.maxCategories} categories; the header declares ${categoryCount}.`
    );
  }
  const expectedBits = categoryBitWidth(categoryCount);
  if (categoryBits !== expectedBits) {
    fail(
      "invalid-binary-header",
      `The header declares ${categoryBits} category bit(s) for ${categoryCount} categories, but ${categoryCount} categories need ${expectedBits}. The blob was probably re-tagged with a different category list.`
    );
  }
  if (maxRows < FLOOR_PLAN_LIMITS.minRows || maxRows > FLOOR_PLAN_LIMITS.maxRows) {
    fail(
      "invalid-binary-header",
      `The header declares ${maxRows} row(s); a floor must have between ${FLOOR_PLAN_LIMITS.minRows} and ${FLOOR_PLAN_LIMITS.maxRows}.`
    );
  }
  if (maxCols < FLOOR_PLAN_LIMITS.minCols || maxCols > FLOOR_PLAN_LIMITS.maxCols) {
    fail(
      "invalid-binary-header",
      `The header declares ${maxCols} column(s); a floor must have between ${FLOOR_PLAN_LIMITS.minCols} and ${FLOOR_PLAN_LIMITS.maxCols}.`
    );
  }
  if (declaredLength !== byteLength) {
    fail(
      "invalid-binary-length",
      declaredLength > byteLength
        ? `The payload is truncated: the header declares ${declaredLength} bytes, only ${byteLength} are present.`
        : `The payload has ${byteLength - declaredLength} trailing byte(s) after the declared ${declaredLength}.`
    );
  }
  if (fnv1a32(bytes, PLAN_BINARY_HEADER_BYTES) !== checksum) {
    fail("invalid-binary-checksum", "The payload checksum does not match its contents.");
  }

  const totalCells = floorCount * maxRows * maxCols;
  if (labelCount > totalCells) {
    fail(
      "invalid-binary-header",
      `The header declares ${labelCount} label(s) for at most ${totalCells} cell(s).`
    );
  }
  if ((flags & FLAG_HAS_LABELS) !== (labelCount > 0 ? FLAG_HAS_LABELS : 0)) {
    fail("invalid-binary-header", "The has-labels flag disagrees with the declared label count.");
  }

  const reader = new ByteReader(bytes);
  const title = reader.string("plan title", MAX_STRING_BYTES);

  const categories: Category[] = [];
  const categoryIds: string[] = [];
  for (let index = 0; index < categoryCount; index += 1) {
    const path = `categories[${index}]`;
    const id = reader.string(`${path} id`, MAX_STRING_BYTES);
    const name = reader.string(`${path} name`, MAX_STRING_BYTES);
    const red = reader.u8(`${path} colour`);
    const green = reader.u8(`${path} colour`);
    const blue = reader.u8(`${path} colour`);
    const shortLabel = reader.string(`${path} short label`, MAX_STRING_BYTES);
    const code = reader.u8(`${path} pattern`);
    const pattern = CELL_PATTERNS[code];
    if (pattern === undefined) {
      fail(
        "invalid-binary-body",
        `The ${path} pattern code ${code} is not one of 0..${CELL_PATTERNS.length - 1}.`,
        `${path}.pattern`
      );
    }
    categories.push({
      id,
      name,
      color: `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`,
      shortLabel,
      pattern,
    });
    categoryIds.push(id);
  }

  const floors: Array<Record<string, unknown>> = [];
  const floorCells: FloorCell[][][] = [];
  const floorOffsets: number[] = [];
  let ordinalBase = 0;
  let observedMaxRows = 0;
  let observedMaxCols = 0;

  for (let index = 0; index < floorCount; index += 1) {
    const path = `floors[${index}]`;
    const id = reader.string(`${path} id`, MAX_STRING_BYTES);
    const name = reader.string(`${path} name`, MAX_STRING_BYTES);
    const rows = reader.u16(`${path} rows`);
    const cols = reader.u16(`${path} cols`);

    if (rows < FLOOR_PLAN_LIMITS.minRows || rows > maxRows) {
      fail(
        "invalid-binary-header",
        `The ${path} declares ${rows} row(s), but the header caps floors at ${maxRows}.`,
        `${path}.rows`
      );
    }
    if (cols < FLOOR_PLAN_LIMITS.minCols || cols > maxCols) {
      fail(
        "invalid-binary-header",
        `The ${path} declares ${cols} column(s), but the header caps floors at ${maxCols}.`,
        `${path}.cols`
      );
    }

    // Bounds check BEFORE allocating: no floor's grid can exceed the
    // all-machine bound, and none can be empty (every cell costs 2 bits).
    const gridLength = reader.varint(`${path} cell grid length`);
    const minGridLength = Math.ceil((rows * cols * CELL_KIND_BITS) / 8);
    const maxGridLength = maxGridByteLength(rows, cols, categoryBits);
    if (gridLength < minGridLength || gridLength > maxGridLength) {
      fail(
        "invalid-binary-length",
        `The ${path} declares a ${gridLength}-byte cell grid; ${rows} x ${cols} cells need between ${minGridLength} and ${maxGridLength} bytes.`,
        `${path}.cells`
      );
    }
    const gridBytes = reader.bytesAt(gridLength, `${path} cell grid`);
    const cells = unpackCellGrid(gridBytes, rows, cols, categoryBits, categoryIds, `${path}.cells`);

    floors.push({ id, name, rows, cols, cells });
    floorCells.push(cells);
    floorOffsets.push(ordinalBase);
    ordinalBase += rows * cols;
    observedMaxRows = Math.max(observedMaxRows, rows);
    observedMaxCols = Math.max(observedMaxCols, cols);
  }

  if (observedMaxRows !== maxRows || observedMaxCols !== maxCols) {
    fail(
      "invalid-binary-header",
      `The header declares ${maxRows} x ${maxCols} but the largest floor is ${observedMaxRows} x ${observedMaxCols}.`
    );
  }

  applyLabels(reader, labelCount, floorCells, floorOffsets, ordinalBase);

  if (reader.remaining !== 0) {
    fail(
      "invalid-binary-length",
      `${reader.remaining} unexplained byte(s) remain after the label table.`
    );
  }

  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    title,
    categories,
    floors,
  };
}

function unpackCellGrid(
  grid: Uint8Array,
  rows: number,
  cols: number,
  categoryBits: number,
  categoryIds: readonly string[],
  path: string
): FloorCell[][] {
  const reader = new BitReader(grid);
  const cells: FloorCell[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowCells: FloorCell[] = [];
    for (let col = 0; col < cols; col += 1) {
      const cellPath = `${path}[${row}][${col}]`;
      const kind = reader.read(CELL_KIND_BITS, cellPath);
      if (kind === KIND_EMPTY) {
        rowCells.push(EMPTY_CELL);
        continue;
      }
      if (kind === KIND_VOID) {
        rowCells.push(VOID_CELL);
        continue;
      }
      if (kind === KIND_RESERVED) {
        fail(
          "invalid-cell",
          `Cell kind code ${KIND_RESERVED} is reserved and cannot appear in a payload.`,
          cellPath
        );
      }
      const index = reader.read(categoryBits, cellPath);
      const categoryId = categoryIds[index];
      if (categoryId === undefined) {
        fail(
          "unknown-category",
          `Machine cell references category index ${index}, but the payload defines ${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}.`,
          cellPath
        );
      }
      rowCells.push({ kind: "machine", categoryId });
    }
    cells.push(rowCells);
  }

  if (!reader.hasOnlyZeroPadding()) {
    fail(
      "invalid-binary-length",
      `The packed cell grid for ${path} carries non-padding bits after its last cell; the declared grid length is too long for its contents.`,
      path
    );
  }

  return cells;
}

/**
 * Reads the label side table and attaches each label to its machine cell.
 *
 * Ordinals must be strictly ascending: the encoder writes them in cell order,
 * so a descending or repeated ordinal means the blob was not produced by this
 * codec (and a repeated one would silently drop a label).
 */
function applyLabels(
  reader: ByteReader,
  labelCount: number,
  floorCells: FloorCell[][][],
  floorOffsets: readonly number[],
  totalCells: number
): void {
  let previous = -1;

  for (let index = 0; index < labelCount; index += 1) {
    const ordinal = reader.varint("label cell ordinal");
    if (ordinal <= previous) {
      fail(
        "invalid-binary-body",
        `Label ${index} has cell ordinal ${ordinal}; label ordinals must be strictly ascending (previous was ${previous}).`
      );
    }
    if (ordinal >= totalCells) {
      fail(
        "invalid-binary-body",
        `Label ${index} points at cell ${ordinal}, but the plan has ${totalCells} cell(s).`
      );
    }

    const byteLength = reader.varint("label length");
    if (byteLength === 0) {
      fail("invalid-cell", `Label ${index} is empty; a machine label must not be empty.`);
    }
    if (byteLength > MAX_LABEL_BYTES) {
      fail(
        "invalid-binary-body",
        `Label ${index} declares ${byteLength} byte(s); the maximum is ${MAX_LABEL_BYTES}.`
      );
    }
    const label = decodeUtf8(reader.bytesAt(byteLength, `label ${index}`), `label ${index}`);
    previous = ordinal;

    let floorIndex = 0;
    while (floorIndex + 1 < floorOffsets.length && floorOffsets[floorIndex + 1] <= ordinal) {
      floorIndex += 1;
    }
    const local = ordinal - floorOffsets[floorIndex];
    const cells = floorCells[floorIndex];
    const cols = cells[0]?.length ?? 0;
    const row = cols === 0 ? 0 : Math.floor(local / cols);
    const col = cols === 0 ? 0 : local % cols;
    const cell = cells[row]?.[col];
    const path = `floors[${floorIndex}].cells[${row}][${col}]`;
    if (cell === undefined) {
      fail("invalid-binary-body", `Label ${index} points at a cell that does not exist.`, path);
    }
    if (cell.kind !== "machine") {
      fail(
        "invalid-cell",
        `A label ("${label}") is attached to a ${cell.kind} cell; only machine cells can carry one.`,
        path
      );
    }
    cells[row][col] = { kind: "machine", categoryId: cell.categoryId, label };
  }
}

// ---------------------------------------------------------------------------
// v2 -> v3 migration
// ---------------------------------------------------------------------------

/**
 * `PLAN_MIGRATIONS[2]`: schema v2 to schema v3.
 *
 * v3 does NOT change the JSON text grammar: the readable envelope keeps the v2
 * token rows (see `wire.ts`), and the whole point of v3 is that storage holds
 * the packed binary payload above instead of JSON. What changes at v3 is the
 * value the module treats as canonical, so this step **normalises** a v2 record
 * into canonical v3 form:
 *
 *   1. each floor's `cells` is decoded with `decodeFloorRows` (which accepts the
 *      token grammar, `[kind, length]` runs AND expanded cell objects, so a v2
 *      record that mixed the three migrates);
 *   2. the decoded grid is re-encoded with `encodeFloorCells`, so runs are
 *      collapsed canonically, expanded cell objects become tokens and a machine
 *      label is written once, in token form;
 *   3. `schemaVersion` is stamped 3.
 *
 * The normalisation is what makes the migration worth running: `decodeFloorRows`
 * tolerates three input shapes for compatibility, and `serializePlan` only ever
 * emits one. A migrated record is guaranteed to be in that one.
 *
 * A floor whose rows do NOT decode (unknown token, overflowing run, out-of-range
 * category index, row count mismatch) is passed through untouched instead of
 * being "repaired": those cases already have good, actionable issue codes
 * (`invalid-cells`, `unknown-category`) and guessing at a corrupt row would lose
 * owner data. Validation reports them right after the migration.
 */
export function migrateV2PlanRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const categoryIdsByIndex: (string | undefined)[] = [];
  const categoryIndex = new Map<string, number>();
  categories.forEach((category, index) => {
    const id = isRecord(category) && typeof category.id === "string" ? category.id : undefined;
    categoryIdsByIndex[index] = id;
    if (id !== undefined && !categoryIndex.has(id)) categoryIndex.set(id, index);
  });

  const floors = Array.isArray(raw.floors)
    ? raw.floors.map((floor) => migrateV2Floor(floor, categoryIdsByIndex, categoryIndex))
    : raw.floors;

  return { ...raw, schemaVersion: FLOOR_PLAN_SCHEMA_VERSION, floors };
}

function migrateV2Floor(
  raw: unknown,
  categoryIdsByIndex: readonly (string | undefined)[],
  categoryIndex: ReadonlyMap<string, number>
): unknown {
  if (!isRecord(raw)) return raw;
  const cells = raw.cells;
  if (!Array.isArray(cells)) return raw;

  const cols = raw.cols;
  if (
    typeof cols !== "number" ||
    !Number.isInteger(cols) ||
    cols < FLOOR_PLAN_LIMITS.minCols ||
    cols > FLOOR_PLAN_LIMITS.maxCols
  ) {
    return raw;
  }

  const rows = raw.rows;
  const rowsValid =
    typeof rows === "number" &&
    Number.isInteger(rows) &&
    rows >= FLOOR_PLAN_LIMITS.minRows &&
    rows <= FLOOR_PLAN_LIMITS.maxRows;

  const decoded = decodeFloorRows(
    cells,
    cols,
    categoryIdsByIndex,
    "cells",
    rowsValid ? (rows as number) : FLOOR_PLAN_LIMITS.maxRows
  );
  if (decoded.cells === null) return raw;

  return { ...raw, cells: encodeFloorCells(decoded.cells, categoryIndex) };
}
