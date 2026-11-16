import {
  decodePlanBytes,
  deserializePlan,
  encodePlanBytes,
  parsePlanValue,
} from "@/modules/gym-floor-plan";
import type { DeserializeResult, GymFloorPlan } from "@/modules/gym-floor-plan";

// The codec seam for the gym floor plan.
//
// The storage layer is byte-blind on purpose: `Repository.getFloorPlanPayload()`
// hands back a decompressed `Uint8Array` and `saveFloorPlanPayload()` accepts
// opaque bytes (see `src/lib/db/floorPlanCompression.ts`). That is what lets the
// on-disk encoding change — text, gzip, a packed binary format — without a
// schema migration or a data-layer change.
//
// Something has to turn the editor's plan object into bytes and back. That is
// this seam, and it is the ONLY place in the app where the two representations
// meet. Wiring a different encoding is a one-line change to the `planCodec`
// value at the bottom of this file; no route and no repository code moves.

/**
 * The byte-level contract the two floor-plan routes move data through.
 *
 * `encode` is infallible by contract: callers pass a plan that has already been
 * validated by the codec's own `decode` (or, on POST, by `validateIncomingPlan`),
 * so a throw here is a programming error and the route maps it to a `400`.
 */
export interface PlanCodec {
  /** Canonical bytes for a validated plan. */
  encode(plan: GymFloorPlan): Uint8Array;
  /** Bytes back to a validated plan, with the module's warnings and issues. */
  decode(bytes: Uint8Array): DeserializeResult;
  /** Optional human-readable name, surfaced in logs when a decode fails. */
  readonly name: string;
}

/**
 * Validates whatever the editor sent.
 *
 * The editor normally posts the plan as an object, but a JSON string is also
 * accepted (e.g. a client that round-trips the serialized form) so callers do
 * not have to know which representation the endpoint prefers.
 *
 * Lives here rather than in a route because it is part of the codec boundary:
 * it decides which shapes are acceptable *input* to `encode`.
 */
export function validateIncomingPlan(value: unknown): DeserializeResult {
  if (typeof value === "string") return deserializePlan(value);
  return parsePlanValue(value);
}

// The codec used by both floor-plan routes.
//
// Schema v3: a packed binary record. The grid is 2 bits per square kind plus a
// per-plan category index width, machine labels live in a side table (a plan
// with no labels pays zero label bytes), and a 24-byte header carries a magic,
// the version, the counts, the total length and an FNV-1a checksum — so a
// truncated or tampered payload is rejected by name instead of decoding to
// plausible garbage.
//
// The storage layer gzips whatever this returns and never inspects it, so this
// value is the only place in the app where a plan object meets bytes.
export const planCodec: PlanCodec = {
  name: "binary-v3",
  encode: (plan) => encodePlanBytes(plan),
  decode: (bytes) => decodePlanBytes(bytes),
};

/** Human-readable reason for a failed decode, using the codec's first issue. */
export function describeDecodeFailure(codec: PlanCodec, result: DeserializeResult): string {
  if (result.ok) return "";
  const first = result.issues[0];
  return `${codec.name} payload is invalid: ${first?.code ?? "unknown"} (${
    first?.message ?? "no message"
  })`;
}
