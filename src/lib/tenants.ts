import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { defaultGymConfig } from "@/config/gymConfig";
import { hashPinSync } from "./passwordHash";
import { DEFAULT_TENANT_ID, getDataDir } from "./sqliteDb";
import { isDemoMode } from "./flags";

export interface Tenant {
  id: string;
  name: string;
  domains: string[];
  adminPasswordHash: string;
  // Read-only staff role (trainer). Empty means trainer login is disabled.
  trainerPasswordHash: string;
  createdAt: string;
}

// The registry lives in its own database so it is independent of any tenant's
// data. Tenant *lookups* happen in the Node runtime (route handlers), not in
// Next middleware, because middleware runs on the Edge runtime where
// `node:sqlite` is unavailable.
let registry: DatabaseSync | null = null;

// Domain -> tenant id lookups happen on every request, so they are cached
// briefly instead of hitting SQLite each time. The TTL keeps admin edits (e.g.
// adding a domain) visible within a few seconds.
const DOMAIN_CACHE_TTL_MS = 10_000;
let domainCache: { byDomain: Map<string, string>; at: number } | null = null;

function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  return host.split(":")[0].trim().toLowerCase();
}

// Chooses the password the default tenant is seeded with.
//
// Production must never fall back to a known password: an operator who forgets
// ADMIN_PASSWORD would expose /admin with a known password. Returning null
// there means the tenant is not seeded at all, so admin login answers 503 until
// the variable is configured. Development and explicit demo mode keep a known
// fallback for convenience.
export const DEMO_ADMIN_PASSWORD = "admin1";

export function adminSeedPassword(
  nodeEnv: string | undefined,
  adminPassword: string | undefined,
  demoMode = false
): string | null {
  if (adminPassword) return adminPassword;
  if (demoMode) return DEMO_ADMIN_PASSWORD;
  return nodeEnv === "production" ? null : "admin";
}

// Legacy shared trainer password. Named staff trainer accounts live in each
// tenant's staff_accounts table; this fallback is optional in production.
export const DEMO_TRAINER_PASSWORD = "trainer1";

export function trainerSeedPassword(
  nodeEnv: string | undefined,
  trainerPassword: string | undefined,
  demoMode = false
): string | null {
  if (trainerPassword) return trainerPassword;
  if (demoMode) return DEMO_TRAINER_PASSWORD;
  return nodeEnv === "production" ? null : DEMO_TRAINER_PASSWORD;
}

// How long the registry waits for a competing writer before failing. Matches the
// tenant databases (getDatabase()); without it, workers that boot together fail
// immediately with "database is locked" on the very first statement.
const REGISTRY_BUSY_TIMEOUT_MS = 5000;

// Adds the trainer_password_hash column to a registry created before the trainer
// role existed. Two workers can both see the column missing and both ALTER, and
// the second gets "duplicate column name" — which means the upgrade succeeded.
// Any other error must still propagate.
export function ensureTrainerPasswordColumn(db: DatabaseSync): void {
  const hasColumn = (): boolean =>
    (db.prepare("PRAGMA table_info(tenants)").all() as Array<{ name: string }>).some(
      (column) => column.name === "trainer_password_hash"
    );

  if (hasColumn()) return;

  try {
    db.exec("ALTER TABLE tenants ADD COLUMN trainer_password_hash TEXT NOT NULL DEFAULT ''");
  } catch (err) {
    // Another process added it between the check and the ALTER.
    if (!hasColumn()) throw err;
  }
}

// Seeds the default tenant when its row is missing — not merely when the table
// is empty. An operator may have created other tenants first (via
// scripts/create-tenant.mjs), which would otherwise leave unmatched hosts
// (localhost, the current single-gym deployment) with no tenant at all.
//
// Exported so its race-safety can be tested without real process concurrency:
// PM2 cluster mode starts several workers that all run this at once.
export function seedDefaultTenant(db: DatabaseSync): void {
  const exists = (): boolean =>
    Boolean(db.prepare("SELECT id FROM tenants WHERE id = ?").get(DEFAULT_TENANT_ID));

  if (exists()) return;

  const seedPassword = adminSeedPassword(
    process.env.NODE_ENV,
    process.env.ADMIN_PASSWORD,
    isDemoMode()
  );
  if (!seedPassword) {
    console.warn(
      "[tenants] ADMIN_PASSWORD is not set; refusing to seed the default tenant. Set ADMIN_PASSWORD, or DEMO_MODE=1 for a demo deployment."
    );
    return;
  }

  const trainerPassword = trainerSeedPassword(
    process.env.NODE_ENV,
    process.env.TRAINER_PASSWORD,
    isDemoMode()
  );

  try {
    db.prepare(
      "INSERT INTO tenants (id, name, domains, admin_password_hash, trainer_password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      DEFAULT_TENANT_ID,
      defaultGymConfig.gymName,
      JSON.stringify([]),
      hashPinSync(seedPassword),
      trainerPassword ? hashPinSync(trainerPassword) : "",
      new Date().toISOString()
    );
  } catch (err) {
    // A concurrent worker may have inserted the row between our check and this
    // INSERT. That is success: the tenant exists. Anything else (a full disk, an
    // unexpected constraint) must not be swallowed.
    if (!exists()) throw err;
  }
}

export function getRegistry(): DatabaseSync {
  if (registry) return registry;

  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(path.join(dir, "registry.db"));
  // Wait for a competing writer instead of failing fast: PM2 cluster mode starts
  // every worker at once against the same data directory.
  db.exec(`PRAGMA busy_timeout = ${REGISTRY_BUSY_TIMEOUT_MS};`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domains TEXT NOT NULL,
      admin_password_hash TEXT NOT NULL,
      trainer_password_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  ensureTrainerPasswordColumn(db);
  seedDefaultTenant(db);

  registry = db;
  return registry;
}

function rowToTenant(row: Record<string, unknown>): Tenant {
  let domains: string[] = [];
  try {
    const parsed = JSON.parse(String(row.domains));
    if (Array.isArray(parsed)) domains = parsed.map((d) => String(d).toLowerCase());
  } catch (err) {
    console.error("[tenants] failed to parse domains:", err);
  }

  return {
    id: String(row.id),
    name: String(row.name),
    domains,
    adminPasswordHash: String(row.admin_password_hash),
    trainerPasswordHash: String(row.trainer_password_hash ?? ""),
    createdAt: String(row.created_at),
  };
}

export function listTenants(): Tenant[] {
  try {
    const rows = getRegistry().prepare("SELECT * FROM tenants ORDER BY created_at ASC").all();
    return (rows as Record<string, unknown>[]).map(rowToTenant);
  } catch (err) {
    console.error("[tenants] listTenants failed:", err);
    return [];
  }
}

export function getTenant(id: string): Tenant | null {
  try {
    const row = getRegistry().prepare("SELECT * FROM tenants WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToTenant(row) : null;
  } catch (err) {
    console.error("[tenants] getTenant failed:", err);
    return null;
  }
}

function refreshDomainCache(): Map<string, string> {
  const byDomain = new Map<string, string>();
  for (const tenant of listTenants()) {
    for (const domain of tenant.domains) {
      byDomain.set(normalizeHost(domain), tenant.id);
    }
  }
  domainCache = { byDomain, at: Date.now() };
  return byDomain;
}

// Resolves the tenant that owns a Host header. Unknown hosts fall back to the
// default tenant, so localhost, an IP address or an unregistered domain still
// serves the single-gym site rather than failing.
export function resolveTenantId(host: string | null | undefined): string {
  const clean = normalizeHost(host);
  if (!clean) return DEFAULT_TENANT_ID;

  const cached = domainCache && Date.now() - domainCache.at < DOMAIN_CACHE_TTL_MS
    ? domainCache.byDomain
    : refreshDomainCache();

  return cached.get(clean) ?? DEFAULT_TENANT_ID;
}

export function resolveTenantIdFromHeaders(headers: Headers): string {
  return resolveTenantId(headers.get("host") ?? headers.get("x-forwarded-host"));
}

export interface CreateTenantInput {
  id: string;
  name: string;
  domains?: string[];
  adminPassword: string;
  trainerPassword?: string;
}

// Creates a tenant. Fails if the id or any of its domains is already taken.
export function createTenant(input: CreateTenantInput): boolean {
  const id = input.id.trim().toLowerCase();
  const domains = (input.domains ?? []).map(normalizeHost).filter(Boolean);

  if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(id)) return false;
  if (!input.name.trim() || !input.adminPassword) return false;

  const taken = new Set(
    listTenants().flatMap((tenant) => (tenant.id === id ? [] : tenant.domains))
  );
  if (domains.some((domain) => taken.has(domain))) return false;

  try {
    getRegistry()
      .prepare(
        "INSERT INTO tenants (id, name, domains, admin_password_hash, trainer_password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.name.trim(),
        JSON.stringify(domains),
        hashPinSync(input.adminPassword),
        input.trainerPassword ? hashPinSync(input.trainerPassword) : "",
        new Date().toISOString()
      );

    domainCache = null;
    return true;
  } catch (err) {
    console.error("[tenants] createTenant failed:", err);
    return false;
  }
}
