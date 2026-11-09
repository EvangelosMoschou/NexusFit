import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-tenant-"));
process.env.SQLITE_DATA_DIR = tempDir;
process.env.ADMIN_PASSWORD = "default-admin-pw";

import { getRepository } from "./db";
import { adminSessionToken } from "./adminAuth";
import {
  adminSeedPassword,
  createTenant,
  ensureTrainerPasswordColumn,
  getRegistry,
  getTenant,
  listTenants,
  resolveTenantId,
  seedDefaultTenant,
  trainerSeedPassword,
} from "./tenants";
import { DEFAULT_TENANT_ID } from "./sqliteDb";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("tenant registry", () => {
  it("seeds a default tenant so single-gym deployments keep working", () => {
    const tenant = getTenant(DEFAULT_TENANT_ID);
    expect(tenant).not.toBeNull();
    expect(listTenants().some((t) => t.id === DEFAULT_TENANT_ID)).toBe(true);
  });

  it("maps a registered domain to its tenant, ignoring case and port", () => {
    expect(
      createTenant({
        id: "iron",
        name: "Iron Gym",
        domains: ["iron.example.com"],
        adminPassword: "pw",
        trainerPassword: "trainer-pw",
      })
    ).toBe(true);

    expect(getTenant("iron")?.trainerPasswordHash.startsWith("scrypt:")).toBe(true);
    expect(getTenant("iron")?.trainerPasswordHash).not.toBe("trainer-pw");

    // Each gym's admin session is bound to its own password hash.
    expect(adminSessionToken("default")).toBeTruthy();
    expect(adminSessionToken("iron")).toBeTruthy();
    expect(adminSessionToken("default")).not.toBe(adminSessionToken("iron"));

    expect(resolveTenantId("iron.example.com")).toBe("iron");
    expect(resolveTenantId("iron.example.com:443")).toBe("iron");
    expect(resolveTenantId("IRON.EXAMPLE.COM")).toBe("iron");
    expect(resolveTenantId("  iron.example.com  ")).toBe("iron");
  });

  it("falls back to the default tenant for unknown, empty or missing hosts", () => {
    expect(resolveTenantId("localhost")).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId("10.0.0.1:3000")).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId("someone-elses-domain.test")).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId(null)).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId(undefined)).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId("")).toBe(DEFAULT_TENANT_ID);
  });

  it("refuses duplicate tenant ids, taken domains and invalid ids", () => {
    expect(
      createTenant({ id: "iron", name: "Duplicate", domains: ["other.test"], adminPassword: "pw" })
    ).toBe(false);

    expect(
      createTenant({ id: "another", name: "Domain clash", domains: ["iron.example.com"], adminPassword: "pw" })
    ).toBe(false);

    expect(createTenant({ id: "BAD ID", name: "Bad", adminPassword: "pw" })).toBe(false);
    expect(createTenant({ id: "ok-id", name: "", adminPassword: "pw" })).toBe(false);
    expect(createTenant({ id: "ok-id", name: "No password", adminPassword: "" })).toBe(false);
  });
});

describe("default tenant admin seed", () => {
  it("requires ADMIN_PASSWORD in production instead of falling back to a known password", () => {
    expect(adminSeedPassword("production", undefined)).toBeNull();
    expect(adminSeedPassword("production", "")).toBeNull();
    expect(adminSeedPassword("production", "s3cret-admin")).toBe("s3cret-admin");
  });

  it("keeps the development fallback", () => {
    expect(adminSeedPassword("development", undefined)).toBe("admin");
    expect(adminSeedPassword(undefined, undefined)).toBe("admin");
  });

  it("uses the demo password only when demo mode is explicit", () => {
    expect(adminSeedPassword("production", undefined, true)).toBe("admin1");
    expect(adminSeedPassword("production", "real-password", true)).toBe("real-password");
    expect(adminSeedPassword("development", undefined, true)).toBe("admin1");
  });

  it("requires TRAINER_PASSWORD in production unless demo mode is explicit", () => {
    expect(trainerSeedPassword("production", undefined, false)).toBeNull();
    expect(trainerSeedPassword("production", undefined, true)).toBe("trainer1");
    expect(trainerSeedPassword("production", "trainer-secret", false)).toBe("trainer-secret");
    expect(trainerSeedPassword("development", undefined)).toBe("trainer1");
  });
});

describe("tenant data isolation", () => {
  const secondTenant = "isolation-gym";

  // This is the first test that opens a tenant database, so it pays the whole
  // one-time boot cost for BOTH the default tenant and the second tenant
  // (schema DDL, the two legacy migrations, demo seeding and the gym-config
  // seed) — ~4.5s on a warm machine. That is close enough to the 5s default
  // that a loaded CI box tips it over, so the budget is explicit here.
  it("keeps leads separate per tenant", { timeout: 20_000 }, async () => {
    createTenant({ id: secondTenant, name: "Isolation Gym", adminPassword: "pw-iso" });

    const email = `iso-lead-${Date.now()}@example.com`;
    expect(await getRepository(secondTenant).saveLead({ fullName: "Iso Lead", email })).toBe(true);

    expect((await getRepository(secondTenant).listLeads()).some((l) => l.email === email)).toBe(true);
    expect((await getRepository(DEFAULT_TENANT_ID).listLeads()).some((l) => l.email === email)).toBe(false);
  });

  it("keeps the gym config separate per tenant", async () => {
    expect(await getRepository(secondTenant).updateGymConfig({ gymName: "ISOLATION GYM" })).toBe(true);

    expect((await getRepository(secondTenant).getGymConfig()).gymName).toBe("ISOLATION GYM");
    expect((await getRepository(DEFAULT_TENANT_ID).getGymConfig()).gymName).toBe("NEXUS ATHLETICS");
  });

  it("keeps members separate per tenant", async () => {
    const code = `NX-ISO-${Date.now()}`;
    expect(
      await getRepository(secondTenant).saveMember({
        memberCode: code,
        fullName: "Iso Member",
        email: `iso-member-${Date.now()}@example.com`,
        pinCode: "4321",
        tierName: "Standard",
        hasAIAccess: false,
        subscriptionStatus: "active",
        expiresAt: "2027-01-01",
      })
    ).toBe(true);

    expect((await getRepository(secondTenant).listMembers()).some((m) => m.member_code === code)).toBe(true);
    expect((await getRepository(DEFAULT_TENANT_ID).listMembers()).some((m) => m.member_code === code)).toBe(false);
  });

  it("cannot authenticate one tenant's member against another tenant", async () => {
    // The seeded demo member exists only in the default tenant's database.
    expect(await getRepository(DEFAULT_TENANT_ID).authenticateMember("NX-8492", "1234")).not.toBeNull();
    expect(await getRepository(secondTenant).authenticateMember("NX-8492", "1234")).toBeNull();
  });
});

// Regression tests for the PM2-cluster boot race. deploy/ecosystem.config.js runs
// `instances: "max"` with `exec_mode: "cluster"`, so N workers open the registry
// at the same moment. These tests simulate the losing worker deterministically
// instead of depending on real process concurrency.
describe("registry boot race", () => {
  // Mirrors the tenants DDL in getRegistry(); kept separate so each test gets an
  // isolated database instead of the shared registry singleton.
  const TENANTS_DDL = `
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domains TEXT NOT NULL,
      admin_password_hash TEXT NOT NULL,
      trainer_password_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `;

  const dirs: string[] = [];

  function freshDb(): DatabaseSync {
    const dir = mkdtempSync(path.join(tmpdir(), "nexusfit-registry-"));
    dirs.push(dir);
    return new DatabaseSync(path.join(dir, "registry.db"));
  }

  function seededDb(): DatabaseSync {
    const db = freshDb();
    db.exec(TENANTS_DDL);
    return db;
  }

  function countDefaultRows(db: DatabaseSync | { prepare(sql: string): unknown }): number {
    const row = (db as DatabaseSync)
      .prepare("SELECT COUNT(*) AS n FROM tenants WHERE id = ?")
      .get(DEFAULT_TENANT_ID) as { n: number };
    return row.n;
  }

  // A view of the same database whose existence check ran before the winning
  // worker committed, so it sees "no row" exactly once and then collides.
  function staleExistenceCheck(db: DatabaseSync): DatabaseSync {
    let lied = false;
    return {
      prepare(sql: string) {
        if (!lied && sql.includes("SELECT id FROM tenants")) {
          lied = true;
          return { get: () => undefined };
        }
        return db.prepare(sql);
      },
    } as unknown as DatabaseSync;
  }

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("waits for a competing writer instead of failing fast on the registry", () => {
    // getDatabase() sets this; the registry used to open without it, so two
    // workers booting together failed immediately with "database is locked".
    expect(getRegistry().prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
  });

  it("seeds the default tenant idempotently", () => {
    const db = seededDb();

    expect(() => seedDefaultTenant(db)).not.toThrow();
    expect(() => seedDefaultTenant(db)).not.toThrow();

    expect(countDefaultRows(db)).toBe(1);
  });

  it("leaves an existing default tenant untouched", () => {
    const db = seededDb();
    db.prepare(
      "INSERT INTO tenants (id, name, domains, admin_password_hash, trainer_password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(DEFAULT_TENANT_ID, "Custom Gym", "[]", "custom-hash", "", "2020-01-01T00:00:00.000Z");

    seedDefaultTenant(db);

    const row = db.prepare("SELECT name, admin_password_hash FROM tenants WHERE id = ?").get(
      DEFAULT_TENANT_ID
    ) as { name: string; admin_password_hash: string };
    expect(row.name).toBe("Custom Gym");
    expect(row.admin_password_hash).toBe("custom-hash");
    expect(countDefaultRows(db)).toBe(1);
  });

  it("treats a lost seed race as success instead of throwing", () => {
    // The winner committed between the loser's existence check and its INSERT.
    const db = seededDb();
    db.prepare(
      "INSERT INTO tenants (id, name, domains, admin_password_hash, trainer_password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(DEFAULT_TENANT_ID, "Winner Gym", "[]", "winner-hash", "", "2020-01-01T00:00:00.000Z");

    expect(() => seedDefaultTenant(staleExistenceCheck(db))).not.toThrow();
    expect(countDefaultRows(db)).toBe(1);
  });

  it("adds the trainer password column to a legacy registry and is idempotent", () => {
    const db = freshDb();
    db.exec(`
      CREATE TABLE tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domains TEXT NOT NULL,
        admin_password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    ensureTrainerPasswordColumn(db);
    expect(() => ensureTrainerPasswordColumn(db)).not.toThrow();

    const columns = (db.prepare("PRAGMA table_info(tenants)").all() as Array<{ name: string }>).map(
      (column) => column.name
    );
    expect(columns).toContain("trainer_password_hash");
    expect(columns.filter((name) => name === "trainer_password_hash")).toHaveLength(1);
  });

  it("treats a lost column-upgrade race as success instead of throwing", () => {
    // Both workers saw the column missing; the winner added it first.
    const db = seededDb();
    let lied = false;
    const staleColumnCheck = {
      prepare(sql: string) {
        if (!lied && sql.includes("PRAGMA table_info")) {
          lied = true;
          return { all: () => [] };
        }
        return db.prepare(sql);
      },
      exec(sql: string) {
        return db.exec(sql);
      },
    } as unknown as DatabaseSync;

    expect(() => ensureTrainerPasswordColumn(staleColumnCheck)).not.toThrow();
  });
});
