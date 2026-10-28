import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Consistent SQLite snapshots for every database under DATA_DIR (the default
// tenant plus the registry and any additional tenants). VACUUM INTO takes a
// read lock and writes a complete, standalone database, so the backup is never
// a torn copy the way a plain file copy of a live database can be.

const dataDir = process.env.DATA_DIR ?? "/data";
const outDir = process.env.BACKUP_DIR ?? "/backups";
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? "14");

fs.mkdirSync(outDir, { recursive: true });

function findDatabases(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findDatabases(full));
    else if (entry.name.endsWith(".db")) found.push(full);
  }
  return found;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const databases = findDatabases(dataDir);
if (databases.length === 0) {
  console.log("no databases found under", dataDir);
  process.exit(0);
}

const suffix = stamp();
let written = 0;

for (const file of databases) {
  const relative = path.relative(dataDir, file);
  const name = relative.replace(/[\\/]+/g, "_").replace(/\.db$/, "");
  const target = path.join(outDir, `${name}-${suffix}.db`);

  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
      written += 1;
    } finally {
      db.close();
    }
  } catch (err) {
    console.error(`backup failed for ${relative}:`, err instanceof Error ? err.message : err);
  }
}

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const entry of fs.readdirSync(outDir)) {
  if (!entry.endsWith(".db")) continue;
  const full = path.join(outDir, entry);
  if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
}

console.log(`backup done: ${written}/${databases.length} databases`);
if (written !== databases.length) process.exit(1);
