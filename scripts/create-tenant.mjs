#!/usr/bin/env node
// Creates a tenant in the NexusFit registry.
//
// Usage:
//   node scripts/create-tenant.mjs <id> <name> <domain> [adminPassword]
//
// Example:
//   node scripts/create-tenant.mjs iron "Iron Gym" iron.example.com 'S3cret!'
//
// The registry lives beside the tenant databases (SQLITE_DATA_DIR, default
// ./data). This script writes it directly with node:sqlite, so it needs no build
// step and no running server. It must be run on the host that owns the data
// directory.

import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

// Same format as src/lib/passwordHash.ts, so the app can verify it.
function hashSecret(secret) {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 32);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

const [id, name, domain, adminPassword] = process.argv.slice(2);

if (!id || !name || !domain || !adminPassword) {
  console.error("Usage: node scripts/create-tenant.mjs <id> <name> <domain> <adminPassword>");
  process.exit(1);
}

const tenantId = id.trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(tenantId)) {
  console.error(`Invalid tenant id "${id}": use 2-39 chars of a-z, 0-9 or -`);
  process.exit(1);
}

const dataDir = process.env.SQLITE_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "registry.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domains TEXT NOT NULL,
    admin_password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const existing = db.prepare("SELECT * FROM tenants").all();
const tenantDomains = domain
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const idTaken = existing.some((t) => t.id === tenantId);
const domainTaken = existing.some((t) => {
  if (t.id === tenantId) return false;
  let domains = [];
  try {
    domains = JSON.parse(t.domains);
  } catch {
    domains = [];
  }
  return domains.some((d) => tenantDomains.includes(String(d).toLowerCase()));
});

if (idTaken) {
  console.error(`Tenant id "${tenantId}" already exists.`);
  process.exit(1);
}
if (domainTaken) {
  console.error(`One of [${tenantDomains.join(", ")}] is already assigned to another tenant.`);
  process.exit(1);
}

db.prepare(
  "INSERT INTO tenants (id, name, domains, admin_password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
).run(tenantId, name.trim(), JSON.stringify(tenantDomains), hashSecret(adminPassword), new Date().toISOString());

console.log(`Created tenant "${tenantId}" (${name.trim()}) serving: ${tenantDomains.join(", ")}`);
console.log(`Its database will be created on first request at ${path.join(dataDir, "tenants", `${tenantId}.db`)}`);
