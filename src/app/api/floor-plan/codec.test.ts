import { describe, expect, it } from "vitest";

// The codec seam, after the switch to the packed binary (schema v3) format.
//
// The regression this file exists for: the storage layer converts a PRE-gzip
// database in place by compressing the legacy `plan_json` TEXT verbatim
// (`migrateFloorPlanPayload` in `src/lib/db/schema.ts`). That text is a schema
// v2 JSON plan, not a v3 binary payload, so a codec whose `decode` only knows
// the binary form reports every already-saved plan as invalid — the deployed
// gym keeps its row and silently loses its floor plan on the first boot after
// the upgrade.
//
// `decode` must therefore accept BOTH stored forms: the current binary payload
// and the legacy JSON text the migration can hand it. `encode` stays
// binary-only, so the next save rewrites the row in the current format.

import {
  createEmptyPlan,
  decodePlanBytes,
  encodePlanBytes,
  serializePlan,
} from "@/modules/gym-floor-plan";
import { describeDecodeFailure, planCodec, validateIncomingPlan } from "./codec";

const encoder = new TextEncoder();

function samplePlan(title = "Seam floor") {
  return createEmptyPlan({ rows: 4, cols: 6, title });
}

/**
 * The bytes a pre-gzip deployment left behind, as the boot migration produces
 * them: the legacy canonical JSON text, UTF-8 encoded.
 */
function legacyPayload(): Uint8Array {
  return encoder.encode(serializePlan(samplePlan("Legacy seam floor")));
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

  it("decodes a legacy JSON-text payload, which is what a migrated row holds", () => {
    // Regression: this is the byte shape `migrateFloorPlanPayload` stores for
    // every pre-gzip deployment. A binary-only decoder answers `invalid-binary-header`
    // here and the owner's plan disappears from the editor and the landing page.
    const bytes = legacyPayload();

    expect(decodePlanBytes(bytes).ok).toBe(false);

    const result = planCodec.decode(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.title).toBe("Legacy seam floor");
    expect(result.plan.floors[0]).toMatchObject({ rows: 4, cols: 6 });
  });

  it("still encodes binary, so one save rewrites a legacy row in the current form", () => {
    const result = planCodec.decode(legacyPayload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reEncoded = planCodec.encode(result.plan);
    // A binary payload, not JSON text: the migration is a one-way door.
    expect(reEncoded[0]).toBe(0x4e);
    expect(reEncoded[1]).toBe(0x46);
    expect(planCodec.decode(reEncoded).ok).toBe(true);
  });

  it("returns the module's issues instead of throwing on garbage bytes", () => {
    const garbage = encoder.encode("{not json at all");

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
    const encoded = encoder.encode(
      JSON.stringify({ schemaVersion: 2, title: "Bad", categories: [], floors: "nope" })
    );

    expect(planCodec.decode(encoded).ok).toBe(false);
  });

  it("rejects legacy JSON that is well-formed but not a valid plan", () => {
    const notAPlan = encoder.encode(JSON.stringify({ schemaVersion: 2, floors: [] }));
    const result = planCodec.decode(notAPlan);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
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
  it("names the codec and the issue code of a malformed TEXT payload", () => {
    // Text that starts with `{` is read as the legacy JSON form, so the honest
    // reason is `invalid-json` — not a binary-header complaint about a payload
    // nobody claimed was binary.
    const result = planCodec.decode(encoder.encode("{not json"));

    const message = describeDecodeFailure(planCodec, result);
    expect(message).toContain("binary-v3");
    expect(message).toContain("invalid-json");
  });

  it("names the binary issue code for bytes that are not text at all", () => {
    const result = planCodec.decode(Uint8Array.from([0x00, 0xff, 0x81, 0xfe]));

    const message = describeDecodeFailure(planCodec, result);
    expect(message).toContain("binary-v3");
    expect(message).toContain("invalid-binary");
  });

  it("is empty for a successful decode", () => {
    expect(describeDecodeFailure(planCodec, planCodec.decode(planCodec.encode(samplePlan())))).toBe(
      ""
    );
  });
});
