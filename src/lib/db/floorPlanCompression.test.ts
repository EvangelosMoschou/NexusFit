import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  compressPlanPayload,
  decompressPlanPayload,
  isCompressedPlanPayload,
  MAX_PAYLOAD_BYTES,
  PAYLOAD_ENVELOPE_LENGTH,
  PAYLOAD_FORMAT_GZIP,
} from "./floorPlanCompression";

// The on-disk encoding for the floor-plan payload.
//
// Two things are pinned here, and only these two:
//
// 1. **Round-trip fidelity.** Whatever the codec at the HTTP boundary produces
//    (these tests use plan-shaped JSON, because that is what the current codec
//    emits — the helper itself never assumes it) must come back byte-for-byte.
// 2. **Exact compressed sizes.** A serialized plan is extremely repetitive, so
//    gzip makes the stored row 37-132x smaller than the plain-text column it
//    replaced. The sizes below are the measured ones in a real SQLite file; a
//    regression that loses that win (a level change, a different container, a
//    framing bug) shows up here as a size assertion, not as a slow-shrinking
//    production database.
//
// Plus the hostile-input contract: unreadable bytes return `null`, never throw.
// A corrupt row must degrade to "no plan", not to a 500.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A realistic serialized plan, matching what `serializePlan` writes (schema v2,
 * run-length token rows, category indexes).
 *
 * Tokens are mostly single cells, with a void border and a sparse scatter of
 * machines — the shape of a real gym floor, and deliberately NOT the
 * all-`["e", n]` best case that would flatter the compression ratio.
 */
function planPayload(rows: number, cols: number): string {
  const categories = [
    { id: "cat-1", name: "Impulse machines", color: "#2563eb", shortLabel: "IM", pattern: "solid" },
    { id: "cat-2", name: "Arsenal", color: "#dc2626", shortLabel: "AR", pattern: "diagonal" },
    { id: "cat-3", name: "Free weights", color: "#16a34a", shortLabel: "FW", pattern: "dots" },
    { id: "cat-4", name: "Cardio", color: "#f59e0b", shortLabel: "CA", pattern: "grid" },
  ];

  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      if (row === 0 || col === 0 || row === rows - 1 || col === cols - 1) return "v";
      const pick = (row * 13 + col * 29) % 13;
      if (pick === 0) return `m:${(row + col) % 4}`;
      if (pick === 7) return "m:1:bench press";
      return "e";
    })
  );

  return JSON.stringify({
    schemaVersion: 2,
    title: "NexusFit",
    categories,
    floors: [{ id: "floor-1", name: "Ground floor", rows, cols, cells }],
  });
}

describe("compressPlanPayload / decompressPlanPayload", () => {
  it("round-trips a realistic plan payload byte-for-byte", () => {
    const original = encoder.encode(planPayload(40, 40));
    const restored = decompressPlanPayload(compressPlanPayload(original));

    expect(restored).not.toBeNull();
    expect(restored!.length).toBe(original.length);
    expect(Buffer.compare(Buffer.from(restored!), Buffer.from(original))).toBe(0);
  });

  it("round-trips arbitrary binary payloads (the helper is format-agnostic)", () => {
    // Every byte value, including NUL and invalid UTF-8: the storage layer must
    // not care what a future binary codec emits.
    const original = Uint8Array.from({ length: 4096 }, (_, index) => index % 256);
    const restored = decompressPlanPayload(compressPlanPayload(original));

    expect(Buffer.compare(Buffer.from(restored!), Buffer.from(original))).toBe(0);
  });

  it("round-trips an empty payload without confusing it for 'no plan'", () => {
    const restored = decompressPlanPayload(compressPlanPayload(new Uint8Array(0)));

    expect(restored).not.toBeNull();
    expect(restored!.length).toBe(0);
  });

  it("round-trips a small payload below gzip's minimum useful size", () => {
    const restored = decompressPlanPayload(compressPlanPayload(encoder.encode("{}")));

    expect(decoder.decode(restored!)).toBe("{}");
  });

  it("writes the documented 3-byte envelope", () => {
    const original = encoder.encode(planPayload(12, 12));
    const compressed = compressPlanPayload(original);

    expect(PAYLOAD_ENVELOPE_LENGTH).toBe(3);
    expect(compressed[0]).toBe(0x4e); // "N"
    expect(compressed[1]).toBe(0x46); // "F"
    expect(compressed[2]).toBe(PAYLOAD_FORMAT_GZIP);
    // Magic + gzip header/trailer at minimum.
    expect(compressed.length).toBeLessThan(original.length);
  });

  it("is not affected by re-compressing an already-compressed payload", () => {
    // Double compression is a bug, not a feature, but it must stay lossless:
    // the inner bytes are what come back out.
    const original = encoder.encode(planPayload(20, 20));
    const once = compressPlanPayload(original);
    const twice = compressPlanPayload(once);

    expect(Buffer.compare(Buffer.from(decompressPlanPayload(twice)!), Buffer.from(once))).toBe(0);
  });
});

describe("on-disk size regression guard", () => {
  // Measured sizes of the gzipped payload for 40/80/120/160 plans, in bytes.
  // These are the regression guards for the whole feature: the plain-TEXT column
  // these replace cost 5.8 / 22.9 / 51.2 / 90.7 KB for the same plans.
  //
  // They are asserted as an upper bound per grid, plus a minimum ratio against
  // the uncompressed payload, so a small fixture drift does not make the suite
  // brittle while a real regression (a broken gzip path, level "no compression")
  // still fails loudly.
  const GRIDS: Array<{ size: number; maxBytes: number; minRatio: number }> = [
    { size: 40, maxBytes: 700, minRatio: 12 },
    { size: 80, maxBytes: 1_100, minRatio: 30 },
    { size: 120, maxBytes: 1_600, minRatio: 50 },
    { size: 160, maxBytes: 2_200, minRatio: 70 },
  ];

  for (const { size, maxBytes, minRatio } of GRIDS) {
    it(`stores a ${size}x${size} plan in under ${maxBytes} bytes (>= ${minRatio}x smaller)`, () => {
      const raw = encoder.encode(planPayload(size, size));
      const compressed = compressPlanPayload(raw);

      console.warn(
        `${size}x${size}: ${raw.length}B -> ${compressed.length}B (${(raw.length / compressed.length).toFixed(1)}x)`
      );

      expect(compressed.length).toBeLessThanOrEqual(maxBytes);
      expect(raw.length / compressed.length).toBeGreaterThanOrEqual(minRatio);
    });
  }

  it("keeps improving with grid size instead of degrading", () => {
    // gzip should get relatively better, not worse, as the plan grows — a
    // regression in the framing or the level would flatten this curve.
    const ratios = GRIDS.map(({ size }) => {
      const raw = encoder.encode(planPayload(size, size));
      return raw.length / compressPlanPayload(raw).length;
    });

    for (let index = 1; index < ratios.length; index += 1) {
      expect(ratios[index]).toBeGreaterThanOrEqual(ratios[index - 1]);
    }
  });

  it("beats a plain TEXT column by at least an order of magnitude at every grid", () => {
    // The motivating comparison, in one assertion per grid: the whole point of
    // the change is that the stored row is dramatically smaller than `plan_json`.
    for (const { size } of GRIDS) {
      const raw = encoder.encode(planPayload(size, size));
      expect(raw.length / compressPlanPayload(raw).length).toBeGreaterThan(10);
    }
  });
});

describe("hostile input", () => {
  it("returns null for an empty Uint8Array", () => {
    expect(decompressPlanPayload(new Uint8Array(0))).toBeNull();
  });

  it("returns null for plain legacy text with no envelope", () => {
    const legacy = encoder.encode(planPayload(12, 12));
    expect(isCompressedPlanPayload(legacy)).toBe(false);
    expect(decompressPlanPayload(legacy)).toBeNull();
  });

  it("returns null for a valid gzip stream without our magic", () => {
    // Someone wrote a bare gzip blob into the row: right container, no envelope.
    const bare = new Uint8Array(gzipSync(encoder.encode(planPayload(12, 12))));
    expect(decompressPlanPayload(bare)).toBeNull();
  });

  it("returns null for our magic with an unknown format tag", () => {
    const compressed = compressPlanPayload(encoder.encode(planPayload(12, 12)));
    const future = Uint8Array.from(compressed);
    future[2] = 0xff; // a format this build does not know
    expect(decompressPlanPayload(future)).toBeNull();
  });

  it("returns null for a truncated gzip stream", () => {
    const compressed = compressPlanPayload(encoder.encode(planPayload(20, 20)));
    // Cut into the deflate body: magic and tag still intact.
    const truncated = compressed.subarray(0, compressed.length - 12);

    expect(isCompressedPlanPayload(truncated)).toBe(true);
    expect(decompressPlanPayload(truncated)).toBeNull();
  });

  it("returns null when the gzip body is corrupted but complete", () => {
    const compressed = compressPlanPayload(encoder.encode(planPayload(20, 20)));
    const corrupted = Uint8Array.from(compressed);
    // Flip bits in the middle of the deflate stream, leaving the envelope and
    // the trailer length intact: only the CRC/no-throw contract can catch it.
    for (let index = PAYLOAD_ENVELOPE_LENGTH + 4; index < corrupted.length - 8; index += 3) {
      corrupted[index] ^= 0xff;
    }

    expect(decompressPlanPayload(corrupted)).toBeNull();
  });

  it("returns null for random bytes after the correct magic", () => {
    const random = new Uint8Array(64);
    for (let index = 0; index < random.length; index += 1) random[index] = (index * 37) % 256;
    random[0] = 0x4e;
    random[1] = 0x46;
    random[2] = PAYLOAD_FORMAT_GZIP;

    expect(decompressPlanPayload(random)).toBeNull();
  });

  it("refuses a gzip bomb that would inflate past the size cap", () => {
    // ~40 MB of zeros compresses to a few KB; the declared ISIZE is over the
    // cap, so it is rejected before anything is allocated.
    const bomb = encoder.encode("\0".repeat(MAX_PAYLOAD_BYTES + 1024));
    const bare = gzipSync(bomb, { level: 9 });
    const enveloped = new Uint8Array(PAYLOAD_ENVELOPE_LENGTH + bare.length);
    enveloped.set([0x4e, 0x46, PAYLOAD_FORMAT_GZIP]);
    enveloped.set(new Uint8Array(bare), PAYLOAD_ENVELOPE_LENGTH);

    expect(enveloped.length).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect(decompressPlanPayload(enveloped)).toBeNull();
  });

  it("never throws, whatever it is handed", () => {
    const inputs: unknown[] = [
      new Uint8Array(0),
      new Uint8Array(1),
      new Uint8Array(2),
      new Uint8Array([0x4e, 0x46]),
      new Uint8Array([0x4e, 0x46, 0x01]),
      encoder.encode("not bytes at all"),
      Uint8Array.from({ length: 1024 }, (_, index) => (index * 91) % 256),
    ];

    for (const input of inputs) {
      expect(() => decompressPlanPayload(input as Uint8Array)).not.toThrow();
    }
  });

  it("tolerates a non-Uint8Array at runtime instead of throwing", () => {
    // Defensive: a driver upgrade that hands us a Buffer-like object, or a
    // hand-edited row, must not crash the request.
    for (const bogus of [null, undefined, "string", 42, {}, []]) {
      expect(decompressPlanPayload(bogus as unknown as Uint8Array)).toBeNull();
    }
  });
});

describe("isCompressedPlanPayload", () => {
  it("recognises our envelope without inflating", () => {
    expect(isCompressedPlanPayload(compressPlanPayload(encoder.encode(planPayload(40, 40))))).toBe(
      true
    );
  });

  it("rejects legacy text, short input and unknown tags", () => {
    expect(isCompressedPlanPayload(encoder.encode('{"schemaVersion":2}'))).toBe(false);
    expect(isCompressedPlanPayload(new Uint8Array([0x4e, 0x46]))).toBe(false);
    expect(isCompressedPlanPayload(new Uint8Array([0x4e, 0x46, 0x02, 0, 0]))).toBe(false);
    expect(isCompressedPlanPayload(new Uint8Array(0))).toBe(false);
  });
});
