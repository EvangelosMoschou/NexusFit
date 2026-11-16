import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { parsePlanValue, type GymFloorPlan } from "@/modules/gym-floor-plan";

// Public, non-personal gym floor plan.
//
// The plan lives in its own `floor_plan` table, NOT inside the `gym_config` blob
// that every visitor downloads through GET /api/config: a large plan would add
// hundreds of kilobytes to the landing payload, and an unrelated admin save
// would rewrite it. Visitors fetch it separately, and only when they need it.
//
// The stored value is validated server-side before it is served: invalid data
// (a hand-edited database, a plan written by a newer schema) is never handed to
// the browser.

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

/** Parses and validates a stored plan string. Never throws. */
function validateStoredPlan(
  raw: string
): { ok: true; plan: GymFloorPlan } | { ok: false; reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "stored floor plan is not valid JSON" };
  }

  const result = parsePlanValue(value);
  if (!result.ok) {
    const first = result.issues[0];
    return {
      ok: false,
      reason: `stored floor plan is invalid: ${first?.code ?? "unknown"} (${
        first?.message ?? "no message"
      })`,
    };
  }
  return { ok: true, plan: result.plan };
}

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);

  try {
    const record = await getRepository(tenantId).getFloorPlanJson();
    const etag = planEtag(record.updatedAt);

    // Conditional request: the client already holds this exact revision.
    // `If-None-Match` may list several tags, so compare token by token.
    if (matchesEtag(req.headers.get("if-none-match"), etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: { "Cache-Control": CACHE_CONTROL, ETag: etag },
      });
    }

    if (!record.json) {
      return cachedJson({ plan: null, updatedAt: null }, etag);
    }

    const parsed = validateStoredPlan(record.json);
    if (!parsed.ok) {
      // Serve "no plan" rather than raw, unvalidated data. `invalid` lets the UI
      // tell "never configured" apart from "the stored value is broken".
      console.error(`[api/floor-plan] ${parsed.reason}`);
      return cachedJson({ plan: null, invalid: true, updatedAt: record.updatedAt }, etag);
    }

    return cachedJson({ plan: parsed.plan, updatedAt: record.updatedAt }, etag);
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load floor plan" },
      { status: 500 }
    );
  }
}
