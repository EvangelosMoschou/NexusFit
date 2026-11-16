import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { describeDecodeFailure, planCodec } from "./codec";

// Public, non-personal gym floor plan.
//
// The plan lives in its own `floor_plan` table, NOT inside the `gym_config` blob
// that every visitor downloads through GET /api/config: a large plan would add
// hundreds of kilobytes to the landing payload, and an unrelated admin save
// would rewrite it. Visitors fetch it separately, and only when they need it.
//
// This handler moves OPAQUE BYTES only. The repository returns the stored
// payload already decompressed (`Repository.getFloorPlanPayload`); the codec
// seam in `./codec` turns those bytes into a plan. The storage format is
// therefore invisible here — swapping gzip for a packed binary encoding is a
// change in `codec.ts` alone.
//
// The stored value is still validated server-side before it is served: invalid
// data (a hand-edited database, a payload written by a newer format) is never
// handed to the browser.

/** Shared-cache lifetime for this public, non-personal document. */
const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

/**
 * A weak ETag derived from the plan's last save time.
 *
 * `updatedAt` changes exactly when the plan changes, so it is a sound
 * validator; `encodeURIComponent` keeps the value inside the HTTP `etagc`
 * grammar (the column quoting of an ISO timestamp would otherwise split it).
 */
function planEtag(updatedAt: string | null): string {
  return `W/"${updatedAt ? encodeURIComponent(updatedAt) : "empty"}"`;
}

function cachedJson(body: Record<string, unknown>, etag: string): NextResponse {
  return NextResponse.json(
    { success: true, ...body },
    { headers: { "Cache-Control": CACHE_CONTROL, ETag: etag } }
  );
}

/**
 * True when the request's `If-None-Match` already covers `etag`.
 *
 * The header may carry a comma-separated list (`"a", "b"`), `W/` weakness
 * markers and the `*` wildcard, so a plain string comparison is not enough.
 */
function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  // A 304 response is identity-encoded, so the stored tag is a weak validator.
  const normalize = (tag: string) => tag.trim().replace(/^W\//, "");
  const current = normalize(etag);
  return ifNoneMatch
    .split(",")
    .map(normalize)
    .some((candidate) => candidate === "*" || candidate === current);
}

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);

  try {
    const record = await getRepository(tenantId).getFloorPlanPayload();
    const etag = planEtag(record.updatedAt);

    // Conditional request: the client already holds this exact revision.
    // `If-None-Match` may list several tags, so compare token by token.
    if (matchesEtag(req.headers.get("if-none-match"), etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: { "Cache-Control": CACHE_CONTROL, ETag: etag },
      });
    }

    if (!record.payload) {
      return cachedJson({ plan: null, updatedAt: null }, etag);
    }

    const decoded = planCodec.decode(record.payload);
    if (!decoded.ok) {
      // Serve "no plan" rather than raw, unvalidated data. `invalid` lets the UI
      // tell "never configured" apart from "the stored value is broken".
      console.error(`[api/floor-plan] ${describeDecodeFailure(planCodec, decoded)}`);
      return cachedJson({ plan: null, invalid: true, updatedAt: record.updatedAt }, etag);
    }

    return cachedJson({ plan: decoded.plan, updatedAt: record.updatedAt }, etag);
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load floor plan" },
      { status: 500 }
    );
  }
}
