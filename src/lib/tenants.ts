import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { defaultGymConfig } from "@/config/gymConfig";
import { hashPin } from "./passwordHash";
import { DEFAULT_TENANT_ID, getDataDir } from "./sqliteDb";
import { isDemoMode } from "./flags";

export interface Tenant {
  id: string;
  name: string;
  domains: string[];
  adminPasswordHash: string;
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

export function getRegistry(): DatabaseSync {
  if (registry) return registry;

  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(path.join(dir, "registry.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domains TEXT NOT NULL,
      admin_password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Seed the default tenant when its row is missing — not merely when the table
  // is empty. An operator may have created other tenants first (via
  // scripts/create-tenant.mjs), which would otherwise leave unmatched hosts
  // (localhost, the current single-gym deployment) with no tenant at all.
  const existing = db.prepare("SELECT id FROM tenants WHERE id = ?").get(DEFAULT_TENANT_ID);
  if (!existing) {
    const seedPassword = adminSeedPassword(
      process.env.NODE_ENV,
      process.env.ADMIN_PASSWORD,
      isDemoMode()
    );
    if (seedPassword) {
      db.prepare(
        "INSERT INTO tenants (id, name, domains, admin_password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(
        DEFAULT_TENANT_ID,
        defaultGymConfig.gymName,
        JSON.stringify([]),
        hashPin(seedPassword),
        new Date().toISOString()
      );
    } else {
      console.warn(
        "[tenants] ADMIN_PASSWORD is not set; refusing to seed the default tenant. Set ADMIN_PASSWORD, or DEMO_MODE=1 for a demo deployment."
      );
    }
  }

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
        "INSERT INTO tenants (id, name, domains, admin_password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, input.name.trim(), JSON.stringify(domains), hashPin(input.adminPassword), new Date().toISOString());

    domainCache = null;
    return true;
  } catch (err) {
    console.error("[tenants] createTenant failed:", err);
    return false;
  }
}
