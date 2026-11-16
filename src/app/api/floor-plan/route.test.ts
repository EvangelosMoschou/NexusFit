import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

// The public floor-plan endpoint is a separate, cached document: the plan moved
// out of the `gym_config` blob so visitors do not download it with /api/config.
// These tests pin its contract — absent, valid, invalid and conditional (ETag)
// responses, plus the shared-cache headers — because the landing UI codes
// against them.

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-api-floorplan-"));
process.env.SQLITE_DATA_DIR = tempDir;

import { GET } from "./route";
import { planCodec } from "./codec";
import { saveFloorPlanPayload } from "@/lib/sqliteDb";
import {
  createEmptyPlan,
  FLOOR_PLAN_SCHEMA_VERSION,
  serializePlan,
} from "@/modules/gym-floor-plan";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Stores a plan the way the admin route does: through the codec seam. */
function storePlan(plan: Parameters<typeof serializePlan>[0]): boolean {
  return saveFloorPlanPayload(planCodec.encode(plan));
}

/** Stores raw bytes, for the corrupt-payload cases. */
function storeBytes(text: string): boolean {
  return saveFloorPlanPayload(new TextEncoder().encode(text));
}

function request(headers: Record<string, string> = {}): NextRequest {
  const host = "localhost";
  return new NextRequest(`http://${host}/api/floor-plan`, {
    headers: { host, "x-forwarded-host": host, ...headers },
  });
}

describe("GET /api/floor-plan", () => {
  it("returns a null plan when none has been saved", async () => {
    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, plan: null, updatedAt: null });
    expect(res.headers.get("cache-control")).toBe("public, max-age=60, stale-while-revalidate=300");
    expect(res.headers.get("etag")).toBe('W/"empty"');
  });

  it("serves a validated plan with its last-saved timestamp", async () => {
    const plan = createEmptyPlan({ rows: 4, cols: 5, title: "Ground floor" });
    expect(storePlan(plan)).toBe(true);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.plan).toMatchObject({
      title: "Ground floor",
      schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    });
    expect(body.plan.floors[0]).toMatchObject({ rows: 4, cols: 5 });
    expect(typeof body.updatedAt).toBe("string");
    expect(body.invalid).toBeUndefined();
  });

  it("never serves an invalid stored value", async () => {
    // `localhost` resolves to the default tenant, which is what this request
    // reads. It is written after the valid-plan test on purpose: this is the
    // last test that mutates the default tenant's row.
    expect(storeBytes("{not json")).toBe(true);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBeNull();
    expect(body.invalid).toBe(true);
    expect(res.headers.get("cache-control")).toContain("public");
  });

  it("answers 304 when the client already holds the current revision", async () => {
    const plan = createEmptyPlan({ rows: 3, cols: 3, title: "Revalidated" });
    expect(storePlan(plan)).toBe(true);

    const first = await GET(request());
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^W\/"/);

    const conditional = await GET(request({ "if-none-match": etag }));
    expect(conditional.status).toBe(304);
    expect(conditional.headers.get("etag")).toBe(etag);

    // A different revision must not be short-circuited.
    const changed = createEmptyPlan({ rows: 3, cols: 3, title: "Changed" });
    expect(storePlan(changed)).toBe(true);

    const stale = await GET(request({ "if-none-match": etag }));
    expect(stale.status).toBe(200);
    expect(stale.headers.get("etag")).not.toBe(etag);

    // A list of tags and the `*` wildcard are honoured too.
    const listed = await GET(
      request({ "if-none-match": `W/"nope", ${stale.headers.get("etag")}` })
    );
    expect(listed.status).toBe(304);

    const wildcard = await GET(request({ "if-none-match": "*" }));
    expect(wildcard.status).toBe(304);
  });
});
