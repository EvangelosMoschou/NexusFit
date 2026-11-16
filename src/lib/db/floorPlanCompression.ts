import { constants, gunzipSync, gzipSync } from "node:zlib";

// On-disk encoding for the gym floor-plan payload.
//
// A serialized plan is extremely repetitive — mostly short token arrays such as
// `["e",12]` repeated once per row — so gzip shrinks it by two orders of
// magnitude. Measured on real plan payloads in a real SQLite file:
//
// | plan        | plain TEXT | gzip BLOB | ratio |
// | ----------- | ---------- | --------- | ----- |
// | 40x40       | 5.8 KB     | 0.2 KB    | 37x   |
// | 80x80       | 22.9 KB    | 0.3 KB    | 68x   |
// | 120x120     | 51.2 KB    | 0.5 KB    | 106x  |
// | 160x160     | 90.7 KB    | 0.7 KB    | 132x  |
//
// This module knows NOTHING about the payload's content. It receives opaque
// bytes (whatever the codec at the HTTP boundary produced), compresses them, and
// hands the same bytes back. That keeps the storage layer independent of the
// portable `@/modules/gym-floor-plan` module and lets the codec change without a
// schema migration.
//
// ## Envelope
//
// Every stored blob starts with three bytes:
//
// | byte | meaning                                                     |
// | ---- | ----------------------------------------------------------- |
// | 0-1  | magic `0x4E 0x46` ("NF")                                    |
// | 2    | payload format tag: `0x01` = gzip, deflate                     |
//
// Why a magic instead of "try gunzip and catch": `gunzipSync` throws on hostile
// input, and a thrown-and-caught control flow cannot tell a truncated gzip from
// a future format from a plain-text legacy row. The magic makes each case an
// explicit branch, so `decompressPlanPayload` can return `null` (the caller then
// falls back) without any exception-driven guessing. The format tag means a
// future algorithm (brotli, zstd) is additive: bump the tag, keep reading gzip.
//
// ## Compression level
//
// We use zlib's default level (`Z_DEFAULT_COMPRESSION`, 6). Measured on a
// 160x160 plan: default 0.7 KB in ~0.4 ms, `Z_BEST_COMPRESSION` (9) 0.7 KB in
// ~1.6 ms — the same rounded size for 4x the CPU, because the payload is
// already this repetitive. `Z_BEST_SPEED` (1) is 0.9 KB, i.e. visibly worse on
// disk. The default is the right point on that curve; do not "optimize" it
// without a new measurement.

/** Envelope magic: "NF" for NexusFit. Never changes; it is the escape hatch. */
const MAGIC_0 = 0x4e;
const MAGIC_1 = 0x46;

/** Payload format tags (byte 2 of the envelope). */
export const PAYLOAD_FORMAT_GZIP = 0x01;

/** The `payload_format` column value written alongside a gzip payload. */
export const PAYLOAD_FORMAT_NAME = "gzip";

/** Length of the envelope prefix in bytes (magic + format tag). */
export const PAYLOAD_ENVELOPE_LENGTH = 3;

/**
 * Largest blob we are willing to inflate, in bytes (8 MB).
 *
 * A gzip bomb needs almost no input to expand enormously, and a corrupted row
 * must not be able to OOM the process. This is checked BEFORE inflating, on the
 * *declared* uncompressed size stored in the gzip trailer, so a hostile blob is
 * rejected without allocating anything. It is also checked after inflating,
 * because the declared size is attacker-controlled too. A legitimate 160x160
 * plan is ~90 KB, so 8 MB leaves two orders of magnitude of headroom for
 * future grid sizes.
 */
export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

/** gzip's own minimum length: 10-byte header + 8-byte trailer. */
const GZIP_MIN_LENGTH = 18;

function isGzipEnvelope(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PAYLOAD_ENVELOPE_LENGTH &&
    bytes[0] === MAGIC_0 &&
    bytes[1] === MAGIC_1 &&
    bytes[2] === PAYLOAD_FORMAT_GZIP
  );
}

/**
 * Wraps `bytes` in the envelope and gzips them.
 *
 * Throws only on a non-`Uint8Array` argument (a programming error, not hostile
 * input) and on zlib running out of memory; callers store the result and let
 * their own `try/catch` report a failed save.
 *
 * The envelope is a PREFIX that stays outside the gzip container:
 * `[0x4E, 0x46, 0x01] ++ gzip(bytes)`. Putting it inside would bury it after a
 * gzip header, and the whole point is that a reader can identify the format
 * without inflating anything.
 */
export function compressPlanPayload(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("compressPlanPayload expects a Uint8Array");
  }

  // Default level: see "Compression level" above — level 9 costs 4x the CPU
  // for no measurable on-disk gain on this payload.
  const body = new Uint8Array(gzipSync(bytes, { level: constants.Z_DEFAULT_COMPRESSION }));

  const out = new Uint8Array(PAYLOAD_ENVELOPE_LENGTH + body.length);
  out[0] = MAGIC_0;
  out[1] = MAGIC_1;
  out[2] = PAYLOAD_FORMAT_GZIP;
  out.set(body, PAYLOAD_ENVELOPE_LENGTH);
  return out;
}

/**
 * Reverses `compressPlanPayload`.
 *
 * Returns the original bytes on success, and `null` for ANYTHING it does not
 * positively recognise: wrong magic, unknown format tag, empty input, non-gzip
 * body, truncated/corrupt gzip, or a blob that would inflate past
 * {@link MAX_PAYLOAD_BYTES}. It never throws, so a hostile row can only ever
 * produce "no plan", never a 500.
 */
export function decompressPlanPayload(bytes: Uint8Array): Uint8Array | null {
  try {
    if (!(bytes instanceof Uint8Array)) return null;
    if (bytes.length < PAYLOAD_ENVELOPE_LENGTH + GZIP_MIN_LENGTH) return null;
    if (!isGzipEnvelope(bytes)) return null;

    const body = bytes.subarray(PAYLOAD_ENVELOPE_LENGTH);

    // Cheap pre-check on the ISIZE field (gzip trailer, little-endian, modulo
    // 2^32) so an obvious bomb never reaches the inflater. A wrapped around
    // value can only make this stricter, never looser, so a false rejection is
    // impossible for a real payload under MAX_PAYLOAD_BYTES.
    if (body.length >= GZIP_MIN_LENGTH) {
      const declared =
        (body[body.length - 4] |
          (body[body.length - 3] << 8) |
          (body[body.length - 2] << 16) |
          (body[body.length - 1] << 24)) >>>
        0;
      if (declared > MAX_PAYLOAD_BYTES) return null;
    }

    // `maxOutputLength` is the authoritative guard: zlib itself aborts once the
    // output would exceed it, so even a declared-size lie cannot exhaust memory.
    // The result is exactly what was compressed — the envelope was a prefix
    // outside the container, so there is nothing to strip.
    const inflated = gunzipSync(body, { maxOutputLength: MAX_PAYLOAD_BYTES });
    if (inflated.length > MAX_PAYLOAD_BYTES) return null;

    return new Uint8Array(inflated);
  } catch {
    // Truncated stream, bad CRC, missing trailer, output cap exceeded, ... —
    // all mean "this row is not a payload we can read".
    return null;
  }
}

/**
 * True when `bytes` looks like our envelope, without inflating anything.
 *
 * Used by the migration to tell an already-converted row from a legacy
 * plain-text one; it is deliberately much cheaper than a full decompress.
 */
export function isCompressedPlanPayload(bytes: Uint8Array): boolean {
  return bytes instanceof Uint8Array && isGzipEnvelope(bytes);
}
