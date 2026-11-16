import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

// Admin CRUD for the floor plan. The stored row is a raw JSON string; the plan
// FORMAT is owned by `@/modules/gym-floor-plan`, so these tests pin the seam:
// validate-then-canonicalize on write, the module's issues on a `400`, the
// editor's read shape, idempotent delete, and the `adminRoute` guard.

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-admin-floorplan-"));
process.env.SQLITE_DATA_DIR = tempDir;
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.SESSION_SECRET = "test-session-secret-for-floor-plan-routes";

import { DELETE, GET, POST } from "./route";
import { planCodec } from "../../floor-plan/codec";
import { adminSessionToken } from "@/lib/adminAuth";
import { getRepository } from "@/lib/db";
import { createEmptyPlan, serializePlan } from "@/modules/gym-floor-plan";
import type { GymFloorPlan } from "@/modules/gym-floor-plan";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const adminToken = adminSessionToken("default")!;

function request(init: { method?: string; body?: unknown; cookie?: string } = {}): NextRequest {
  const host = "localhost";
  const headers: Record<string, string> = {
    host,
    "x-forwarded-host": host,
    cookie: init.cookie ?? `nexusfit_admin=${adminToken}`,
  };
  if (init.body !== undefined) headers["content-type"] = "application/json";

  return new NextRequest(`http://${host}/api/admin/floor-plan`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

function samplePlan(title = "Admin floor"): GymFloorPlan {
  return createEmptyPlan({ rows: 3, cols: 4, title });
}

/**
 * The payload the routes should have stored for a plan.
 *
 * Read back through the SAME codec seam the routes use, because that is the
 * contract: the repository holds whatever bytes the codec produced. Re-deriving
 * it with `serializePlan` would silently pass if the seam changed codecs.
 */
function storedBytes(repository: ReturnType<typeof getRepository>) {
  return repository.getFloorPlanPayload();
}

describe("admin floor-plan auth", () => {
  it("rejects a request without an admin session", async () => {
    const res = await GET(request({ cookie: "" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
  });

  it("rejects a tampered admin session", async () => {
    const res = await GET(request({ cookie: "nexusfit_admin=deadbeef" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/floor-plan", () => {
  it("returns a null plan when none has been saved", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, plan: null, updatedAt: null });
  });

  it("returns the parsed plan plus its warnings for the editor", async () => {
    const plan = samplePlan();
    expect((await POST(request({ method: "POST", body: { plan } }))).status).toBe(200);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.plan.title).toBe("Admin floor");
    expect(body.plan.floors[0]).toMatchObject({ rows: 3, cols: 4 });
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(typeof body.updatedAt).toBe("string");
  });

  it("does not hand a corrupt stored value to the editor", async () => {
    await getRepository().saveFloorPlanPayload(new TextEncoder().encode('{"schemaVersion":1}'));

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBeNull();
    expect(body.invalid).toBe(true);
  });
});

describe("POST /api/admin/floor-plan", () => {
  it("validates, canonicalizes and stores the plan", async () => {
    // Deliberately non-canonical input: extra keys are stripped, key order is
    // fixed and the current schemaVersion is stamped by serializePlan.
    const plan = samplePlan("Canonical me") as GymFloorPlan & Record<string, unknown>;
    plan.extraKey = "strip me";

    const res = await POST(request({ method: "POST", body: { plan } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.warnings)).toBe(true);

    // The stored payload is the codec's canonical bytes: extra keys stripped,
    // key order fixed, current schemaVersion stamped. The codec is a packed
    // binary format, so this compares bytes rather than text.
    const stored = await storedBytes(getRepository());
    expect(stored.format).toBe("gzip");
    expect(
      Buffer.from(stored.payload!).equals(Buffer.from(planCodec.encode(samplePlan("Canonical me"))))
    ).toBe(true);
    // The extra key cannot survive the binary encoding at all.
    expect(new TextDecoder().decode(Buffer.from(stored.payload!))).not.toContain("extraKey");
  });

  it("accepts the serialized string form too", async () => {
    const serialized = serializePlan(samplePlan("From a string"));

    const res = await POST(request({ method: "POST", body: { plan: serialized } }));
    expect(res.status).toBe(200);

    // A serialized v2/v3 string is accepted on input and normalized to the
    // codec's bytes, so the stored payload is the binary form of the same plan.
    const stored = await storedBytes(getRepository());
    expect(
      Buffer.from(stored.payload!).equals(
        Buffer.from(planCodec.encode(samplePlan("From a string")))
      )
    ).toBe(true);
  });

  it("rejects a missing plan body with 400", async () => {
    const res = await POST(request({ method: "POST", body: {} }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "Missing plan data" });
  });

  it("rejects a malformed JSON body with 400", async () => {
    const host = "localhost";
    const req = new NextRequest(`http://${host}/api/admin/floor-plan`, {
      method: "POST",
      headers: {
        host,
        "x-forwarded-host": host,
        "content-type": "application/json",
        cookie: `nexusfit_admin=${adminToken}`,
      },
      body: "{not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "Invalid JSON body" });
  });

  it("returns the module's validation issues on an invalid plan", async () => {
    const invalid = { schemaVersion: 1, title: "Bad", categories: [], floors: "nope" };
    const res = await POST(request({ method: "POST", body: { plan: invalid } }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Invalid floor plan");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(typeof body.issues[0].code).toBe("string");
  });

  it("does not overwrite the stored plan when the payload is invalid", async () => {
    await POST(request({ method: "POST", body: { plan: samplePlan("Keep me") } }));
    const before = await storedBytes(getRepository());

    await POST(request({ method: "POST", body: { plan: { schemaVersion: 99 } } }));
    const after = await storedBytes(getRepository());

    expect(Array.from(after.payload!)).toEqual(Array.from(before.payload!));
    expect(after.updatedAt).toBe(before.updatedAt);
  });
});

describe("DELETE /api/admin/floor-plan", () => {
  it("clears the plan and is idempotent", async () => {
    await POST(request({ method: "POST", body: { plan: samplePlan("Delete me") } }));

    const first = await DELETE(request({ method: "DELETE" }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: true, removed: true });
    expect((await storedBytes(getRepository())).payload).toBeNull();

    const second = await DELETE(request({ method: "DELETE" }));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ success: true, removed: false });
  });

  it("also requires an admin session", async () => {
    const res = await DELETE(request({ method: "DELETE", cookie: "" }));
    expect(res.status).toBe(401);
  });
});
