import { afterAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Characterization tests for the database boot path: data-directory resolution,
// the per-tenant connection cache, the schema/DDL, the one-time migrations and
// the demo/site-config seeding that run on first connection.
//
// These pin the behaviour of `getDatabase()` before it is split into cohesive
// modules, so the refactor can be proven behaviour-preserving.

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-conn-test-"));
process.env.SQLITE_DATA_DIR = tempDir;

import { DEFAULT_TENANT_ID, getDatabase, getDataDir } from "@/lib/sqliteDb";
import { defaultGymConfig } from "@/config/gymConfig";
import { verifyPin } from "@/lib/passwordHash";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Opens a tenant database file directly, without going through the cache. */
function openRaw(tenantId: string): DatabaseSync {
  const dir = path.join(tempDir, "tenants");
  mkdirSync(dir, { recursive: true });
  return new DatabaseSync(path.join(dir, `${tenantId}.db`));
}

function tableNames(db: DatabaseSync): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);
}

function indexNames(db: DatabaseSync): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

describe("getDataDir", () => {
  it("honours SQLITE_DATA_DIR when it is set", () => {
    expect(getDataDir()).toBe(tempDir);
  });

  it("falls back to <cwd>/data when unset", () => {
    const saved = process.env.SQLITE_DATA_DIR;
    delete process.env.SQLITE_DATA_DIR;
    try {
      expect(getDataDir()).toBe(path.join(process.cwd(), "data"));
    } finally {
      process.env.SQLITE_DATA_DIR = saved;
    }
  });

  it("falls back to /tmp/nexusfit on Vercel when SQLITE_DATA_DIR is unset", () => {
    const savedDir = process.env.SQLITE_DATA_DIR;
    const savedVercel = process.env.VERCEL;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.SQLITE_DATA_DIR;
    process.env.VERCEL = "1";
    try {
      expect(getDataDir()).toBe("/tmp/nexusfit");
      expect(warn).toHaveBeenCalled();
    } finally {
      if (savedDir === undefined) delete process.env.SQLITE_DATA_DIR;
      else process.env.SQLITE_DATA_DIR = savedDir;
      if (savedVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = savedVercel;
      warn.mockRestore();
    }
  });
});

describe("connection cache and file layout", () => {
  it("returns the same connection for the same tenant and a different one per tenant", () => {
    const a = getDatabase("t-cache-a");
    const b = getDatabase("t-cache-a");
    const c = getDatabase("t-cache-b");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("keeps the default tenant on the legacy nexusfit.db path", () => {
    getDatabase();
    expect(existsSync(path.join(tempDir, "nexusfit.db"))).toBe(true);
  });

  it("gives every other tenant its own file under tenants/", () => {
    getDatabase("t-layout");
    expect(existsSync(path.join(tempDir, "tenants", "t-layout.db"))).toBe(true);
  });

  it("enables foreign keys and a busy timeout on every connection", () => {
    const db = getDatabase("t-pragmas");
    const foreignKeys = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    const busyTimeout = db.prepare("PRAGMA busy_timeout").get() as { timeout: number };

    expect(foreignKeys.foreign_keys).toBe(1);
    expect(busyTimeout.timeout).toBe(5000);
  });
});

describe("schema", () => {
  it("creates every table the application relies on", () => {
    const db = getDatabase("t-schema");
    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        "access_events",
        "audit_log",
        "lead_inquiries",
        "media",
        "member_notifications",
        "member_sessions",
        "members",
        "site_config",
        "staff_accounts",
        "visits",
        "workout_plans",
      ])
    );
  });

  it("creates the indexes that back the hot queries", () => {
    const db = getDatabase("t-schema");
    expect(indexNames(db)).toEqual(
      expect.arrayContaining([
        "idx_access_events_created",
        "idx_access_events_member",
        "idx_audit_action",
        "idx_audit_created",
        "idx_audit_entity",
        "idx_member_sessions_expiry",
        "idx_member_sessions_member",
        "idx_notifications_dedupe",
        "idx_notifications_member",
        "idx_staff_active",
        "idx_visits_checked_in",
        "idx_visits_member",
        "idx_visits_one_open",
        "idx_visits_open",
      ])
    );
  });

  it("cascades deletes from members to every child table", () => {
    const db = getDatabase("t-cascade");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO members (id, member_code, full_name, email, pin_code, tier_name, has_ai_access, subscription_status, expires_at, created_at)
       VALUES ('m-cascade', 'NX-CAS', 'Cascade Test', 'cascade@example.com', 'scrypt:x:y', 'T', 0, 'active', '2030-01-01', ?)`
    ).run(now);
    db.prepare(
      `INSERT INTO workout_plans (id, member_id, split_name, split_type, days_per_week, session_duration, plan_json, created_at)
       VALUES ('p-cascade', 'm-cascade', 'S', 'full_body', 3, 60, '{}', ?)`
    ).run(now);
    db.prepare(
      `INSERT INTO visits (id, member_id, checked_in_at, created_at) VALUES ('v-cascade', 'm-cascade', ?, ?)`
    ).run(now, now);
    db.prepare(
      `INSERT INTO member_sessions (session_id_hash, member_id, created_at, last_seen_at, expires_at)
       VALUES ('h-cascade', 'm-cascade', 1, 1, 2)`
    ).run();
    db.prepare(
      `INSERT INTO member_notifications (id, member_id, type, title, body, dedupe_key, created_at)
       VALUES ('n-cascade', 'm-cascade', 't', 'T', 'B', 'k', ?)`
    ).run(now);
    db.prepare(
      `INSERT INTO access_events (id, member_id, event_type, details, created_at)
       VALUES ('a-cascade', 'm-cascade', 'duplicate_entry', '{}', ?)`
    ).run(now);

    db.prepare("DELETE FROM members WHERE id = 'm-cascade'").run();

    for (const table of [
      "workout_plans",
      "visits",
      "member_sessions",
      "member_notifications",
      "access_events",
    ]) {
      const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
      expect(row.c, `${table} should cascade`).toBe(0);
    }
  });
});

describe("seeding", () => {
  it("seeds the two demo members for the default tenant with hashed PINs", async () => {
    const db = getDatabase();
    const rows = db
      .prepare(
        "SELECT member_code, pin_code FROM members WHERE member_code IN ('NX-8492', 'NX-3109')"
      )
      .all() as Array<{ member_code: string; pin_code: string }>;

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.pin_code.startsWith("scrypt:")).toBe(true);
      expect(await verifyPin("1234", row.pin_code)).toBe(true);
    }
  });

  it("seeds the demo access flags and historical visits for the default tenant", () => {
    const db = getDatabase();
    const events = db
      .prepare("SELECT COUNT(*) as c FROM access_events WHERE member_id = 'mem-3109'")
      .get() as { c: number };
    const visits = db.prepare("SELECT COUNT(*) as c FROM visits").get() as { c: number };

    expect(events.c).toBe(2);
    expect(visits.c).toBeGreaterThan(0);
  });

  it("does not seed demo members into a non-default tenant", () => {
    const db = getDatabase("t-no-seed");
    const row = db.prepare("SELECT COUNT(*) as c FROM members").get() as { c: number };
    expect(row.c).toBe(0);
  });

  it("seeds site_config with the default gym config", () => {
    const db = getDatabase("t-config");
    const row = db.prepare("SELECT value FROM site_config WHERE key = 'gym_config'").get() as
      { value: string } | undefined;

    expect(row).toBeDefined();
    expect(JSON.parse(row!.value)).toEqual(defaultGymConfig);
  });

  it("is idempotent across a simulated restart", async () => {
    const tenant = "t-restart";
    const first = getDatabase(tenant);
    const membersBefore = (
      first.prepare("SELECT COUNT(*) as c FROM members").get() as { c: number }
    ).c;
    const configBefore = (
      first.prepare("SELECT COUNT(*) as c FROM site_config").get() as { c: number }
    ).c;

    // A fresh module instance has an empty connection cache, exactly like a new
    // process: it re-runs the boot sequence against the existing database file.
    vi.resetModules();
    const fresh = await import("@/lib/sqliteDb");
    const reopened = fresh.getDatabase(tenant);

    expect((reopened.prepare("SELECT COUNT(*) as c FROM members").get() as { c: number }).c).toBe(
      membersBefore
    );
    expect(
      (reopened.prepare("SELECT COUNT(*) as c FROM site_config").get() as { c: number }).c
    ).toBe(configBefore);
  });
});

describe("one-time migrations", () => {
  it("hashes legacy plaintext PINs on boot", async () => {
    const tenant = "t-pin-migration";
    const raw = openRaw(tenant);
    raw.exec(`
      CREATE TABLE members (
        id TEXT PRIMARY KEY,
        member_code TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        pin_code TEXT NOT NULL,
        tier_name TEXT NOT NULL DEFAULT 'Standard Gym Access',
        has_ai_access INTEGER NOT NULL DEFAULT 0,
        subscription_status TEXT NOT NULL DEFAULT 'active',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    raw
      .prepare(
        `INSERT INTO members (id, member_code, full_name, email, pin_code, tier_name, has_ai_access, subscription_status, expires_at, created_at)
         VALUES ('m-legacy', 'NX-LEG', 'Legacy Member', 'legacy@example.com', '1234', 'T', 0, 'active', '2030-01-01', '2020-01-01T00:00:00.000Z')`
      )
      .run();
    raw.close();

    const db = getDatabase(tenant);
    const row = db.prepare("SELECT pin_code FROM members WHERE id = 'm-legacy'").get() as {
      pin_code: string;
    };

    expect(row.pin_code).not.toBe("1234");
    expect(row.pin_code.startsWith("scrypt:")).toBe(true);
    expect(await verifyPin("1234", row.pin_code)).toBe(true);
  });

  it("adds last_activity_at to a legacy visits table and backfills it", () => {
    const tenant = "t-visit-migration";
    const raw = openRaw(tenant);
    raw.exec(`
      CREATE TABLE members (
        id TEXT PRIMARY KEY,
        member_code TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        pin_code TEXT NOT NULL,
        tier_name TEXT NOT NULL DEFAULT 'Standard Gym Access',
        has_ai_access INTEGER NOT NULL DEFAULT 0,
        subscription_status TEXT NOT NULL DEFAULT 'active',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE visits (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        checked_in_at TEXT NOT NULL,
        checked_out_at TEXT,
        created_at TEXT NOT NULL
      );
    `);
    raw
      .prepare(
        `INSERT INTO members (id, member_code, full_name, email, pin_code, tier_name, has_ai_access, subscription_status, expires_at, created_at)
         VALUES ('m-old', 'NX-OLD', 'Old Member', 'old@example.com', 'scrypt:a:b', 'T', 0, 'active', '2030-01-01', '2020-01-01T00:00:00.000Z')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO visits (id, member_id, checked_in_at, checked_out_at, created_at)
         VALUES ('v-old', 'm-old', '2020-05-05T10:00:00.000Z', NULL, '2020-05-05T10:00:00.000Z')`
      )
      .run();
    raw.close();

    const db = getDatabase(tenant);
    const columns = db.prepare("PRAGMA table_info(visits)").all() as Array<{ name: string }>;
    expect(columns.some((column) => column.name === "last_activity_at")).toBe(true);

    const row = db.prepare("SELECT last_activity_at FROM visits WHERE id = 'v-old'").get() as {
      last_activity_at: string;
    };
    expect(row.last_activity_at).toBe("2020-05-05T10:00:00.000Z");
  });
});

describe("default tenant id", () => {
  it("is the documented 'default' value", () => {
    expect(DEFAULT_TENANT_ID).toBe("default");
  });
});
