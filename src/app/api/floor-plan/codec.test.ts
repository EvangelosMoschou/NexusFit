import { describe, expect, it } from "vitest";

// The codec seam shared by the two floor-plan routes.
//
// The storage layer is byte-blind: the repository stores whatever bytes the
// codec produces (gzipped) and hands them back decompressed. This file is the
// only place the plan object and those bytes meet, so these tests pin the
// contract a different codec must honour: `encode` produces bytes `decode`
// reads back, and `decode` never throws on hostile input.

import {
  createEmptyPlan,
  decodePlanBytes,
  encodePlanBytes,
  serializePlan,
} from "@/modules/gym-floor-plan";
import { describeDecodeFailure, planCodec, validateIncomingPlan } from "./codec";

function samplePlan(title = "Seam floor") {
  return createEmptyPlan({ rows: 4, cols: 6, title });
}

describe("planCodec", () => {
  it("round-trips a plan through bytes", () => {
    const plan = samplePlan();
    const result = planCodec.decode(planCodec.encode(plan));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.title).toBe("Seam floor");
    expect(result.plan.floors[0]).toMatchObject({ rows: 4, cols: 6 });
    expect(result.plan.schemaVersion).toBe(plan.schemaVersion);
  });

  it("encodes canonical bytes, not the input object as given", () => {
    const plan = samplePlan() as ReturnType<typeof samplePlan> & Record<string, unknown>;
    plan.extraKey = "strip me";

    const encoded = planCodec.encode(plan as ReturnType<typeof samplePlan>);

    // Canonical means: the extra key is gone and the bytes are exactly what the
    // module's own encoder produces for a clean plan of the same content.
    expect(encoded).toEqual(encodePlanBytes(samplePlan()));
    const decoded = decodePlanBytes(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.plan).not.toHaveProperty("extraKey");
  });

  it("returns the module's issues instead of throwing on garbage bytes", () => {
    const garbage = new TextEncoder().encode("{not json at all");

    let result: ReturnType<typeof planCodec.decode> | undefined;
    expect(() => {
      result = planCodec.decode(garbage);
    }).not.toThrow();

    expect(result!.ok).toBe(false);
    if (result!.ok) return;
    expect(result!.issues.length).toBeGreaterThan(0);
    expect(typeof result!.issues[0].code).toBe("string");
  });

  it("returns invalid for non-UTF-8 bytes rather than throwing", () => {
    const binary = Uint8Array.from([0xff, 0xfe, 0x00, 0x80, 0x81]);

    let result: ReturnType<typeof planCodec.decode> | undefined;
    expect(() => {
      result = planCodec.decode(binary);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("rejects a semantically invalid plan", () => {
    const encoded = new TextEncoder().encode(
      JSON.stringify({ schemaVersion: 2, title: "Bad", categories: [], floors: "nope" })
    );

    expect(planCodec.decode(encoded).ok).toBe(false);
  });

  it("exposes a stable name for logs and audit details", () => {
    expect(planCodec.name).toBe("binary-v3");
  });
});

describe("validateIncomingPlan", () => {
  it("accepts the object form", () => {
    const result = validateIncomingPlan(samplePlan("From an object"));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.title).toBe("From an object");
  });

  it("accepts the serialized string form", () => {
    const serialized = serializePlan(samplePlan("From a string"));
    const result = validateIncomingPlan(serialized);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.title).toBe("From a string");
  });

  it("rejects a malformed string and a non-plan value", () => {
    expect(validateIncomingPlan("{not json").ok).toBe(false);
    expect(validateIncomingPlan({ schemaVersion: 99 }).ok).toBe(false);
    expect(validateIncomingPlan(null).ok).toBe(false);
    expect(validateIncomingPlan(42).ok).toBe(false);
  });
});

describe("describeDecodeFailure", () => {
  it("names the codec and its first issue code", () => {
    const result = planCodec.decode(new TextEncoder().encode("{not json"));

    const message = describeDecodeFailure(planCodec, result);
    expect(message).toContain("binary-v3");
    // Garbage bytes fail the binary header check before any field is read.
    expect(message).toContain("invalid-binary");
  });

  it("is empty for a successful decode", () => {
    expect(describeDecodeFailure(planCodec, planCodec.decode(planCodec.encode(samplePlan())))).toBe(
      ""
    );
  });
});
