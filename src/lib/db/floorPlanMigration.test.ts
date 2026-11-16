import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// The `floor_plan` upgrade path, against a genuinely LEGACY database file.
//
// The realistic risk of this feature is not the fresh-install case (DDL creates
// the new shape and nobody notices) — it is the existing deployment whose
// `floor_plan` table was created by the old `CREATE TABLE` and already holds the
// owner's plan as raw text in a `plan_json TEXT NOT NULL` column. That row is
// irreplaceable, and it sits under a column that the new code no longer writes.
//
// So these tests build the OLD schema by hand, insert a row exactly as the old
// code would have, and then run the real boot sequence (`initializeDatabase`,
// which is what `getDatabase()` calls) over it. They pin four things:
//
// 1. the row survives and decompresses to the identical bytes;
// 2. it is stored as a gzip BLOB in the new `payload` column, with `format`
//    'gzip' and `plan_json` emptied/dropped;
// 3. a second run is a no-op (the migration is on every boot, in every worker);
// 4. a fresh database comes up with the new shape directly.

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-floorplan-migration-"));
process.env.SQLITE_DATA_DIR = tempDir;

import { getDatabase, getFloorPlanPayload, saveFloorPlanPayload } from "@/lib/sqliteDb";
import { decompressPlanPayload, isCompressedPlanPayload } from "./floorPlanCompression";
import { initializeDatabase, migrateFloorPlanPayload } from "./schema";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The on-disk file a tenant uses.
 *
 * Mirrors `databasePathFor` in `./connection`: the default tenant keeps the
 * legacy `nexusfit.db`, every other tenant gets `tenants/<id>.db`. Getting this
 * wrong would build the fixture in a file the connection never opens, and the
 * "migration" would silently pass against an empty fresh database.
 */
function tenantFile(tenantId: string): string {
  if (tenantId === "default") return path.join(tempDir, "nexusfit.db");
  return path.join(tempDir, "tenants", `${tenantId}.db`);
}

/** The plan text an old deployment has in its `plan_json` column. */
function legacyPlan(title = "Legacy floor"): string {
  return JSON.stringify({
    schemaVersion: 2,
    title,
    categories: [
      { id: "cat-1", name: "Impulse", color: "#2563eb", shortLabel: "IM", pattern: "solid" },
    ],
    floors: [
      {
        id: "floor-1",
        name: "Ground floor",
        rows: 40,
        cols: 40,
        cells: Array.from({ length: 40 }, (_, row) =>
          Array.from({ length: 40 }, (_, col) => ((row * 13 + col * 29) % 13 === 0 ? "m:0" : "e"))
        ),
      },
    ],
  });
}

/**
 * Creates a database file with the PRE-migration `floor_plan` schema and one
 * row in it — exactly the state an existing deployment is in.
 */
function createLegacyDatabase(file: string, planJson: string, rowId = "default"): void {
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
      rowId,
      planJson,
      "2025-01-02T03:04:05.000Z"
    );
  } finally {
    db.close();
  }
}

function columnsOf(db: DatabaseSync): Array<{ name: string; type: string; notnull: number }> {
  return db.prepare("PRAGMA table_info(floor_plan)").all() as Array<{
    name: string;
    type: string;
    notnull: number;
  }>;
}

describe("floor_plan legacy row migration", () => {
  it("compresses an existing plan_json row in place and keeps the bytes", () => {
    const planJson = legacyPlan();
    createLegacyDatabase(tenantFile("legacy-tenant"), planJson);

    // First connection = the first time the new code meets the old file.
    const db = getDatabase("legacy-tenant");

    const row = db
      .prepare(
        "SELECT id, payload, payload_format, typeof(payload) AS kind, updated_at FROM floor_plan"
      )
      .get() as {
      id: string;
      payload: Uint8Array;
      payload_format: string;
      kind: string;
      updated_at: string;
    };

    // The row is still there, still 'default', and the timestamp is untouched.
    expect(row.id).toBe("default");
    expect(row.updated_at).toBe("2025-01-02T03:04:05.000Z");

    // Stored as a real BLOB with the envelope, not as text.
    expect(row.kind).toBe("blob");
    expect(row.payload).toBeInstanceOf(Uint8Array);
    expect(isCompressedPlanPayload(row.payload)).toBe(true);
    expect(row.payload_format).toBe("gzip");

    // Byte-for-byte the same plan, and dramatically smaller on disk.
    const restored = decompressPlanPayload(row.payload);
    expect(restored).not.toBeNull();
    expect(decoder.decode(restored!)).toBe(planJson);
    expect(row.payload.length).toBeLessThan(encoder.encode(planJson).length / 10);

    // And the public read path returns the same bytes.
    expect(decoder.decode(getFloorPlanPayload("legacy-tenant").payload!)).toBe(planJson);
  });

  it("converges on the fresh-database shape (plan_json is gone)", () => {
    createLegacyDatabase(tenantFile("legacy-shape"), legacyPlan());

    const db = getDatabase("legacy-shape");
    const names = columnsOf(db).map((column) => column.name);

    // Column-for-column identical to a fresh database: a migrated database must
    // not be a shape anything can tell apart.
    expect(names).toEqual(["id", "payload", "payload_format", "updated_at"]);
    expect(names).not.toContain("plan_json");

    // The legacy column was NOT NULL with no default. If it were still there,
    // every save would fail; this INSERT is the regression guard for that.
    expect(saveFloorPlanPayload(encoder.encode('{"schemaVersion":2}'), "legacy-shape")).toBe(true);
  });

  it("is idempotent across a second and third run", () => {
    const planJson = legacyPlan("Idempotent floor");
    createLegacyDatabase(tenantFile("legacy-idempotent"), planJson);

    const db = getDatabase("legacy-idempotent");
    const first = db
      .prepare("SELECT payload, updated_at FROM floor_plan WHERE id = 'default'")
      .get() as { payload: Uint8Array; updated_at: string };

    // Every process (PM2 cluster workers, dev hot-reload) re-runs the boot
    // sequence. Each extra pass must be a no-op, not a re-compression.
    expect(() => initializeDatabase(db, "legacy-idempotent")).not.toThrow();
    expect(() => initializeDatabase(db, "legacy-idempotent")).not.toThrow();
    expect(() => migrateFloorPlanPayload(db)).not.toThrow();

    const second = db
      .prepare("SELECT payload, updated_at FROM floor_plan WHERE id = 'default'")
      .get() as { payload: Uint8Array; updated_at: string };

    expect(Buffer.compare(Buffer.from(second.payload), Buffer.from(first.payload))).toBe(0);
    expect(second.updated_at).toBe(first.updated_at);
    expect(decompressPlanPayload(second.payload)!.length).toBe(encoder.encode(planJson).length);
  });

  it("leaves an already-migrated row completely alone", () => {
    const tenant = "legacy-already-modern";
    expect(saveFloorPlanPayload(encoder.encode(legacyPlan("Modern floor")), tenant)).toBe(true);

    const db = getDatabase(tenant);
    const before = db
      .prepare("SELECT payload, payload_format, updated_at FROM floor_plan WHERE id = 'default'")
      .get() as { payload: Uint8Array; payload_format: string; updated_at: string };

    initializeDatabase(db, tenant);

    const after = db
      .prepare("SELECT payload, payload_format, updated_at FROM floor_plan WHERE id = 'default'")
      .get() as { payload: Uint8Array; payload_format: string; updated_at: string };

    expect(Buffer.compare(Buffer.from(after.payload), Buffer.from(before.payload))).toBe(0);
    expect(after.payload_format).toBe("gzip");
    expect(after.updated_at).toBe(before.updated_at);
  });

  it("handles a legacy database with no plan row at all", () => {
    const file = tenantFile("legacy-empty");
    mkdirSync(path.dirname(file), { recursive: true });
    const raw = new DatabaseSync(file);
    raw.exec(`
      CREATE TABLE floor_plan (
        id TEXT PRIMARY KEY,
        plan_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    raw.close();

    const db = getDatabase("legacy-empty");

    expect(columnsOf(db).map((column) => column.name)).not.toContain("plan_json");
    expect(getFloorPlanPayload("legacy-empty")).toEqual({
      payload: null,
      format: null,
      updatedAt: null,
    });
  });

  it("survives the upgrade when the legacy value is empty", () => {
    // A hand-cleared row: `plan_json` present but blank. It means "no plan", and
    // must not be stored as a compressed empty string that then decodes to "".
    createLegacyDatabase(tenantFile("legacy-blank"), "");

    const db = getDatabase("legacy-blank");
    const row = db
      .prepare("SELECT payload, payload_format FROM floor_plan WHERE id = 'default'")
      .get() as { payload: Uint8Array | null; payload_format: string | null };

    expect(row.payload).toBeNull();
    expect(row.payload_format).toBeNull();
    expect(getFloorPlanPayload("legacy-blank")).toEqual({
      payload: null,
      format: null,
      updatedAt: null,
    });
    expect(columnsOf(db).map((column) => column.name)).not.toContain("plan_json");
  });

  it("gives a fresh database the new shape with no legacy column", () => {
    const db = getDatabase("fresh-shape");
    const columns = columnsOf(db);

    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "payload",
      "payload_format",
      "updated_at",
    ]);
    expect(columns.find((column) => column.name === "payload")?.type).toBe("BLOB");
    expect(columns.find((column) => column.name === "id")?.notnull).toBe(0);
    expect(getFloorPlanPayload("fresh-shape")).toEqual({
      payload: null,
      format: null,
      updatedAt: null,
    });
  });

  it("shrinks the stored row 20-100x in a real SQLite file", () => {
    // The motivating measurement, taken through the REAL code path: build a
    // legacy database per grid, let the boot migration compress it, then read
    // the stored column length back out of the file.
    //
    // Reported values (this fixture, one row per database):
    //
    // | plan        | legacy plan_json TEXT | migrated payload BLOB | ratio  |
    // | ----------- | --------------------- | --------------------- | ------ |
    // | 40x40       | 8,719 B               | 408 B                 | 21.4x  |
    // | 80x80       | 33,739 B              | 654 B                 | 51.6x  |
    // | 120x120     | 75,325 B              | 976 B                 | 77.2x  |
    // | 160x160     | 133,549 B             | 1,299 B               | 102.8x |
    //
    // The absolute figures depend on the fixture (the Lead measured 5.8-90.7 KB
    // of TEXT -> 0.2-0.7 KB of gzip on their plans), so the assertion is the
    // ratio, not the byte count: an order of magnitude at every grid, growing
    // with size.
    const measured: Array<{ size: number; text: number; blob: number }> = [];

    for (const size of [40, 80, 120, 160]) {
      const tenant = `measure-${size}`;
      const planJson = JSON.stringify({
        schemaVersion: 2,
        title: `Measured ${size}`,
        categories: [
          {
            id: "cat-1",
            name: "Impulse machines",
            color: "#2563eb",
            shortLabel: "IM",
            pattern: "solid",
          },
          { id: "cat-2", name: "Arsenal", color: "#dc2626", shortLabel: "AR", pattern: "diagonal" },
        ],
        floors: [
          {
            id: "floor-1",
            name: "Ground floor",
            rows: size,
            cols: size,
            cells: Array.from({ length: size }, (_, row) =>
              Array.from({ length: size }, (_, col) => {
                if (row === 0 || col === 0 || row === size - 1 || col === size - 1) return "v";
                const pick = (row * 13 + col * 29) % 13;
                if (pick === 0) return `m:${(row + col) % 2}`;
                if (pick === 7) return "m:1:bench press";
                return "e";
              })
            ),
          },
        ],
      });

      createLegacyDatabase(tenantFile(tenant), planJson);
      const db = getDatabase(tenant);

      const row = db
        .prepare(
          "SELECT length(CAST(payload AS BLOB)) AS blob, typeof(payload) AS kind FROM floor_plan"
        )
        .get() as { blob: number; kind: string };

      expect(row.kind).toBe("blob");
      measured.push({ size, text: encoder.encode(planJson).length, blob: row.blob });

      // The plan is intact after the in-place migration.
      expect(decoder.decode(getFloorPlanPayload(tenant).payload!)).toBe(planJson);
    }

    for (const { size, text, blob } of measured) {
      console.warn(
        `${size}x${size}: TEXT ${text}B -> gzip BLOB ${blob}B (${(text / blob).toFixed(1)}x)`
      );
      expect(text / blob).toBeGreaterThanOrEqual(10);
    }

    // Bigger plans only get more repetitive, never less.
    expect(measured[1].text / measured[1].blob).toBeGreaterThan(
      measured[0].text / measured[0].blob
    );
    expect(measured[3].text / measured[3].blob).toBeGreaterThan(
      measured[2].text / measured[2].blob
    );
  });
});

describe("floor_plan migration crash safety", () => {
  it("keeps the row readable when a previous rebuild left a stray staging table", () => {
    // A process killed mid-rebuild can leave `floor_plan_rebuilt` behind. The
    // next boot must not fail on `CREATE TABLE` colliding with it, and must not
    // double-apply: the real table still has plan_json at this point.
    const tenant = "legacy-stray-rebuild";
    createLegacyDatabase(tenantFile(tenant), legacyPlan("Stray rebuild"));

    const db = getDatabase(tenant);
    db.exec(`
      DROP TABLE IF EXISTS floor_plan_rebuilt;
      CREATE TABLE floor_plan_rebuilt (id TEXT PRIMARY KEY, junk TEXT);
      INSERT INTO floor_plan_rebuilt VALUES ('leftover', 'garbage');
    `);

    // Simulate the legacy state again and re-run the migration over the stray.
    db.exec("DROP TABLE floor_plan");
    db.exec(
      "CREATE TABLE floor_plan (id TEXT PRIMARY KEY, plan_json TEXT NOT NULL, updated_at TEXT NOT NULL)"
    );
    const planJson = legacyPlan("Stray rebuild");
    db.prepare("INSERT INTO floor_plan VALUES ('default', ?, '2025-01-02T03:04:05.000Z')").run(
      planJson
    );

    expect(() => migrateFloorPlanPayload(db)).not.toThrow();

    expect(decoder.decode(getFloorPlanPayload(tenant).payload!)).toBe(planJson);
    const staging = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'floor_plan_rebuilt'"
      )
      .get();
    expect(staging).toBeUndefined();
  });

  it("gives up cleanly when another writer holds the database", () => {
    // `BEGIN IMMEDIATE` needs the write lock. `getDatabase()` sets a generous
    // `busy_timeout`, but an operator-shared file can still be locked past it.
    // The contract is: log, keep the legacy row intact, never throw, and never
    // roll back a transaction the migration does not own.
    //
    // This opens the legacy file DIRECTLY (not via `getDatabase`, which would
    // migrate it on boot) so the migration is the thing under test.
    const tenant = "legacy-locked";
    const file = tenantFile(tenant);
    createLegacyDatabase(file, legacyPlan("Locked floor"));

    const db = new DatabaseSync(file);
    db.exec("PRAGMA busy_timeout = 50");

    // A second connection holds the write lock for the duration.
    const blocker = new DatabaseSync(file);
    blocker.exec("BEGIN IMMEDIATE");
    blocker
      .prepare("INSERT INTO floor_plan VALUES ('blocker', 'x', '2025-01-03T00:00:00.000Z')")
      .run();

    try {
      expect(() => migrateFloorPlanPayload(db)).not.toThrow();

      // The blocker's transaction is untouched and still committable: the
      // migration did not issue a ROLLBACK it did not own.
      expect(() => blocker.exec("COMMIT")).not.toThrow();
    } finally {
      try {
        blocker.exec("ROLLBACK");
      } catch {
        // Already committed.
      }
      blocker.close();
    }

    // The legacy row is still there and still readable as text — nothing lost.
    // (No `payload` column exists yet: with the write lock held even the
    // ADD COLUMN is refused, which is exactly the "do nothing this boot"
    // outcome we want.)
    const row = db.prepare("SELECT plan_json FROM floor_plan WHERE id = 'default'").get() as {
      plan_json: string;
    };
    expect(row.plan_json).toBe(legacyPlan("Locked floor"));
    const columns = db.prepare("PRAGMA table_info(floor_plan)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(["id", "plan_json", "updated_at"]);

    // And a later boot (lock released) migrates it normally.
    const after = new DatabaseSync(file);
    initializeDatabase(after, tenant);
    expect(new TextDecoder().decode(getFloorPlanPayload(tenant).payload!)).toBe(
      legacyPlan("Locked floor")
    );
    after.close();
    db.close();
  });
});
