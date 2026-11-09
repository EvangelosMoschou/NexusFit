import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { DEFAULT_TENANT_ID } from "./tenant";
import { initializeDatabase } from "./schema";

// One open connection per tenant. A Map (not a single singleton) is what makes
// multi-tenancy possible: each gym gets its own database file.
const connections = new Map<string, DatabaseSync>();

// The default tenant deliberately keeps the original single-database path so an
// existing deployment keeps its data. Every other tenant gets its own file.
function databasePathFor(tenantId: string, dataDir: string): string {
  if (tenantId === DEFAULT_TENANT_ID) return path.join(dataDir, "nexusfit.db");

  const tenantDir = path.join(dataDir, "tenants");
  fs.mkdirSync(tenantDir, { recursive: true });
  return path.join(tenantDir, `${tenantId}.db`);
}

// Resolves the directory that holds the SQLite files.
//
// Serverless hosts present a read-only filesystem, so `process.cwd()/data`
// cannot be created there. On Vercel we fall back to /tmp, which is writable
// but ephemeral and per-instance: data does not survive a cold start.
export function getDataDir(): string {
  if (process.env.SQLITE_DATA_DIR) return process.env.SQLITE_DATA_DIR;
  if (process.env.VERCEL) {
    console.warn(
      "[sqliteDb] VERCEL detected without SQLITE_DATA_DIR; falling back to /tmp/nexusfit (data is lost on cold start)."
    );
    return "/tmp/nexusfit";
  }
  return path.join(process.cwd(), "data");
}

export function getDatabase(tenantId: string = DEFAULT_TENANT_ID): DatabaseSync {
  const existing = connections.get(tenantId);
  if (existing) return existing;

  // Writable data directory override (e.g. /tmp on read-only-FS hosts like Vercel).
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = databasePathFor(tenantId, dataDir);
  const db = new DatabaseSync(dbPath);

  // Wait instead of failing fast when a backup or another writer holds the
  // database briefly. Foreign keys are on by default in node:sqlite; stating it
  // keeps the cascade in this schema explicit.
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");

  initializeDatabase(db, tenantId);

  connections.set(tenantId, db);
  return db;
}
