import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";

// A deployment that already has a saved plan, upgraded to this build.
//
// This is the case the feature's own migration was written for and the case the
// codec switch broke: `migrateFloorPlanPayload` converts the legacy
// `floor_plan.plan_json` TEXT column by gzipping it VERBATIM. That text is a
// schema-v2 JSON plan (what the pre-gzip build stored, see `serializePlan`), not
// a schema-v3 packed-binary payload. A binary-only decoder therefore answered
// `invalid-binary-header` for every migrated row: the owner's plan vanished from
// the editor and from the public landing page on the first boot after upgrading,
// with the row still sitting in the database.
//
// These tests drive the REAL boot path (`initializeDatabase` via `getDatabase`)
// over a database file built with the OLD schema, then call the REAL route
// handlers, so the whole upgrade is exercised rather than the codec in isolation.

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-legacy-upgrade-"));
process.env.SQLITE_DATA_DIR = tempDir;
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.SESSION_SECRET = "test-session-secret-for-floor-plan-routes";

import { GET as adminGet } from "./route";
import { GET as publicGet } from "../../floor-plan/route";
import { planCodec } from "../../floor-plan/codec";
import { adminSessionToken } from "@/lib/adminAuth";
import { getFloorPlanPayload } from "@/lib/sqliteDb";
import { initializeDatabase } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/connection";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const adminToken = adminSessionToken("default")!;

/** The plan text a pre-gzip build wrote, in the shape it wrote it. */
const LEGACY_PLAN_JSON = JSON.stringify({
  schemaVersion: 2,
  title: "Legacy gym floor",
  categories: [
    { id: "cat-1", name: "Impulse machines", color: "#2563EB", shortLabel: "IM", pattern: "solid" },
    { id: "cat-2", name: "Cardio", color: "#DC2626", shortLabel: "CA", pattern: "diagonal" },
  ],
  floors: [
    {
      id: "floor-1",
      name: "Ground floor",
      rows: 2,
      cols: 3,
      cells: [
        ["m:0", "m:1", "m:0:Bench press"],
        [["v", 1], ["e", 2]],
      ],
    },
  ],
});

/**
 * The on-disk file a tenant uses.
 *
 * Mirrors `databasePathFor` in `@/lib/db/connection`: the default tenant keeps
 * the legacy `nexusfit.db`, every other tenant gets `tenants/<id>.db`. Getting
 * this wrong builds the fixture in a file the connection never opens, and the
 * "upgrade" silently passes against an empty fresh database.
 */
function tenantFile(tenantId: string): string {
  if (tenantId === "default") return path.join(tempDir, "nexusfit.db");
  return path.join(tempDir, "tenants", `${tenantId}.db`);
}

/**
 * Builds the PRE-gzip `floor_plan` shape — `plan_json TEXT NOT NULL` — with one
 * row in it, exactly as the earlier build left it on disk.
 */
function createLegacyDatabase(tenantId: string, planJson: string): void {
  const file = tenantFile(tenantId);
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec(`
      CREATE TABLE floor_plan (
        id TEXT PRIMARY KEY,
        plan_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO floor_plan (id, plan_json, updated_at) VALUES (?, ?, ?)").run(
      "default",
      planJson,
      "2025-01-02T03:04:05.000Z"
    );
  } finally {
    db.close();
  }
}

function adminRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/floor-plan", {
    headers: {
      host: "localhost",
      "x-forwarded-host": "localhost",
      cookie: `nexusfit_admin=${adminToken}`,
    },
  });
}

function visitorRequest(host: string): NextRequest {
  return new NextRequest(`http://${host}/api/floor-plan`, {
    headers: { host, "x-forwarded-host": host },
  });
}

describe("a plan saved before the gzip + binary upgrade still loads", () => {
  it("the boot migration leaves the legacy row as schema-v2 JSON text", () => {
    // Documenting the precondition the fix depends on: the migration does NOT
    // re-encode into the binary form, it only compresses the stored TEXT.
    createLegacyDatabase("legacy-precondition", LEGACY_PLAN_JSON);
    const db = getDatabase("legacy-precondition");
    initializeDatabase(db, "legacy-precondition");

    const record = getFloorPlanPayload("legacy-precondition");
    expect(record.payload).not.toBeNull();
    expect(new TextDecoder().decode(record.payload!)).toBe(LEGACY_PLAN_JSON);
  }, 20_000);

  it("the admin editor receives the plan instead of invalid: true", async () => {
    // `localhost` resolves to the default tenant, so the legacy row has to live
    // in that tenant's file (`nexusfit.db`).
    createLegacyDatabase("default", LEGACY_PLAN_JSON);
    getDatabase("default");

    const res = await adminGet(adminRequest());
    const body = await res.json();

    expect(body.invalid).toBeUndefined();
    expect(body.plan).not.toBeNull();
    expect(body.plan.title).toBe("Legacy gym floor");
    expect(body.plan.floors[0]).toMatchObject({ rows: 2, cols: 3 });
    // The migrated plan is the current schema, not the stored v2.
    expect(body.plan.schemaVersion).toBe(3);
    expect(body.plan.categories.map((category: { id: string }) => category.id)).toEqual([
      "cat-1",
      "cat-2",
    ]);
    expect(body.plan.floors[0].cells[0][1]).toEqual({
      kind: "machine",
      categoryId: "cat-2",
    });
    expect(body.plan.floors[0].cells[0][2]).toEqual({
      kind: "machine",
      categoryId: "cat-1",
      label: "Bench press",
    });
    expect(body.plan.floors[0].cells[1][0]).toEqual({ kind: "void" });
    // Real boot path over a real SQLite file: this opens the database, runs the
    // schema + payload migration and hashes the seed data, so it needs more than
    // the 5 s default when the whole suite runs in parallel.
  }, 20_000);

  it("a visitor sees the plan on the landing page", async () => {
    const res = await publicGet(visitorRequest("localhost"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invalid).toBeUndefined();
    expect(body.plan).not.toBeNull();
    expect(body.plan.title).toBe("Legacy gym floor");
    // The ETag still comes from the stored row's timestamp.
    expect(res.headers.get("etag")).toBe('W/"2025-01-02T03%3A04%3A05.000Z"');
  });

  it("one save rewrites the row in the binary form, so the legacy path is temporary", async () => {
    const record = getFloorPlanPayload("default");
    const decoded = planCodec.decode(record.payload!);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const reEncoded = planCodec.encode(decoded.plan);
    expect(reEncoded[0]).toBe(0x4e);
    expect(reEncoded[1]).toBe(0x46);
    expect(planCodec.decode(reEncoded).ok).toBe(true);
  });
});
