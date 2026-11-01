#!/usr/bin/env node
// Sets (or rotates) one tenant's admin or trainer password in the registry.
//
// Usage:
//   node scripts/set-tenant-password.mjs <tenantId> <admin|trainer> <newPassword>
//
// Example:
//   node scripts/set-tenant-password.mjs default trainer 'a-long-random-value'
//
// The app reads the registry on each request, so no restart is required. Old
// admin and trainer cookies stop working immediately because both are bound to
// the stored password hash.

import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

function hashSecret(secret) {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 32);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

const [tenantIdArg, role, password] = process.argv.slice(2);

if (!tenantIdArg || !role || !password || (role !== "admin" && role !== "trainer")) {
  console.error(
    "Usage: node scripts/set-tenant-password.mjs <tenantId> <admin|trainer> <newPassword>"
  );
  process.exit(1);
}

const dataDir =
  process.env.SQLITE_DATA_DIR ||
  (process.env.VERCEL ? "/tmp/nexusfit" : path.join(process.cwd(), "data"));
const registryPath = path.join(dataDir, "registry.db");

if (!fs.existsSync(registryPath)) {
  console.error(`Registry not found at ${registryPath}. Start the app once first.`);
  process.exit(1);
}

const tenantId = tenantIdArg.trim().toLowerCase();
const db = new DatabaseSync(registryPath);

const columns = db.prepare("PRAGMA table_info(tenants)").all();
if (!columns.some((column) => column.name === "trainer_password_hash")) {
  db.exec("ALTER TABLE tenants ADD COLUMN trainer_password_hash TEXT NOT NULL DEFAULT ''");
}

const tenant = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
if (!tenant) {
  console.error(`Tenant "${tenantId}" does not exist in ${registryPath}.`);
  process.exit(1);
}

const column = role === "admin" ? "admin_password_hash" : "trainer_password_hash";
db.prepare(`UPDATE tenants SET ${column} = ? WHERE id = ?`).run(hashSecret(password), tenantId);

console.log(`Updated the ${role} password for tenant "${tenantId}".`);
