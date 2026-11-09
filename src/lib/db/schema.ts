import { DatabaseSync } from "node:sqlite";
import { defaultGymConfig } from "@/config/gymConfig";
import { hashPinSync } from "@/lib/passwordHash";
import { envFlag, isDemoMode } from "@/lib/flags";
import { DEFAULT_TENANT_ID } from "./tenant";

// Schema, one-time migrations and first-run seeding.
//
// Everything here runs exactly once per connection, inside getDatabase(), before
// the connection is handed to a caller. It is deliberately separate from the
// query modules: this is the only place that executes DDL.

/** The full schema. Every statement is idempotent (IF NOT EXISTS). */
export const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS members (
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

    CREATE TABLE IF NOT EXISTS workout_plans (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      split_name TEXT NOT NULL,
      split_type TEXT NOT NULL,
      days_per_week INTEGER NOT NULL DEFAULT 3,
      session_duration INTEGER NOT NULL DEFAULT 60,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lead_inquiries (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      goal TEXT,
      preferred_plan TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      alt TEXT NOT NULL DEFAULT '',
      data BLOB NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      checked_in_at TEXT NOT NULL,
      checked_out_at TEXT,
      last_activity_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS staff_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'trainer',
      password_hash TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_staff_active
      ON staff_accounts (active);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_name TEXT NOT NULL,
      actor_email TEXT,
      actor_role TEXT NOT NULL,
      actor_legacy INTEGER NOT NULL DEFAULT 0,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created
      ON audit_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_action
      ON audit_log (action, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_entity
      ON audit_log (entity_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS member_notifications (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
      ON member_notifications (member_id, dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_notifications_member
      ON member_notifications (member_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS member_sessions (
      session_id_hash TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      ip TEXT,
      user_agent TEXT,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_member_sessions_member
      ON member_sessions (member_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_member_sessions_expiry
      ON member_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS access_events (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_access_events_member
      ON access_events (member_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_access_events_created
      ON access_events (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_visits_open
      ON visits (checked_out_at, checked_in_at);
    CREATE INDEX IF NOT EXISTS idx_visits_member
      ON visits (member_id, checked_in_at);
    CREATE INDEX IF NOT EXISTS idx_visits_checked_in
      ON visits (checked_in_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_one_open
      ON visits (member_id) WHERE checked_out_at IS NULL;
`;

// One-time migration: hash any legacy plaintext PINs (idempotent)
export function migrateLegacyPins(db: DatabaseSync): void {
  try {
    const rows = db.prepare("SELECT id, pin_code FROM members").all() as Array<{
      id: string;
      pin_code: string;
    }>;
    const updateStmt = db.prepare("UPDATE members SET pin_code = ? WHERE id = ?");
    for (const row of rows) {
      if (typeof row.pin_code === "string" && !row.pin_code.startsWith("scrypt:")) {
        updateStmt.run(hashPinSync(row.pin_code), row.id);
      }
    }
  } catch (err) {
    console.error("[sqliteDb] pin migration failed:", err);
  }
}

// Upgrade visits created before activity tracking existed.
export function migrateVisitActivity(db: DatabaseSync): void {
  try {
    const columns = db.prepare("PRAGMA table_info(visits)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "last_activity_at")) {
      db.exec("ALTER TABLE visits ADD COLUMN last_activity_at TEXT");
    }
    db.exec("UPDATE visits SET last_activity_at = checked_in_at WHERE last_activity_at IS NULL");
  } catch (err) {
    console.error("[sqliteDb] visit activity migration failed:", err);
  }
}

// Demo data. Only the default tenant is seeded, and only when it is safe to do
// so: a real deployment must not ship accounts with known credentials
// (NX-8492 / PIN 1234). Production therefore requires an explicit
// SEED_DEMO_MEMBERS=1 opt-in, which exists for throwaway demo instances.
export function seedDemoData(db: DatabaseSync, tenantId: string): void {
  // Seed default demo members only for the default tenant and only when it is
  // safe to do so: a real deployment must not ship accounts with known
  // credentials (NX-8492 / PIN 1234). Production therefore requires an explicit
  // SEED_DEMO_MEMBERS=1 opt-in, which exists for throwaway demo instances.
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM members");
  const row = countStmt.get() as { count: number } | undefined;
  const demoSeedAllowed =
    process.env.NODE_ENV !== "production" || isDemoMode() || envFlag(process.env.SEED_DEMO_MEMBERS);

  if (tenantId === DEFAULT_TENANT_ID && demoSeedAllowed && (!row || row.count === 0)) {
    const insertMember = db.prepare(`
      INSERT INTO members (id, member_code, full_name, email, pin_code, tier_name, has_ai_access, subscription_status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Demo members should not appear expired a year from now.
    const seedExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    insertMember.run(
      "mem-8492",
      "NX-8492",
      "Γεώργιος Παπαδόπουλος",
      "george@nexusathletics.gr",
      hashPinSync("1234"),
      "Πλήρης Πρόσβαση & Ψηφιακός Βοηθός (59€/μήνα)",
      1,
      "active",
      seedExpiry,
      new Date().toISOString()
    );

    insertMember.run(
      "mem-3109",
      "NX-3109",
      "Μαρία Κωνσταντίνου",
      "maria@nexusathletics.gr",
      hashPinSync("1234"),
      "Συνδρομή Πλήρους Πρόσβασης (45€/μήνα)",
      0,
      "active",
      seedExpiry,
      new Date().toISOString()
    );
  } else if (tenantId === DEFAULT_TENANT_ID && (!row || row.count === 0)) {
    // Empty members table on a production host: the demo accounts were
    // deliberately not created. Surfacing it here makes a failed demo login
    // diagnosable from the deployment logs.
    console.warn(
      "[sqliteDb] Demo members were not seeded. Set DEMO_MODE=1 (or SEED_DEMO_MEMBERS=1) on a demo deployment."
    );
  }

  // Demo-only flagged profile: NX-3109 has two recent access anomalies so the
  // admin Access tab and the member-list flag are immediately visible in demos.
  if (tenantId === DEFAULT_TENANT_ID && demoSeedAllowed) {
    try {
      const flagged = db.prepare("SELECT id FROM members WHERE id = ?").get("mem-3109") as
        { id: string } | undefined;
      if (flagged) {
        const insertEvent = db.prepare(
          `INSERT OR IGNORE INTO access_events
             (id, member_id, event_type, details, created_at)
           VALUES (?, ?, ?, ?, ?)`
        );
        const now = Date.now();
        insertEvent.run(
          "demo-access-event-1",
          "mem-3109",
          "duplicate_entry",
          JSON.stringify({ direction: "in", source: "demo" }),
          new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
        );
        insertEvent.run(
          "demo-access-event-2",
          "mem-3109",
          "quick_reentry",
          JSON.stringify({
            direction: "in",
            source: "demo",
            quickReentryMinutes: 30,
          }),
          new Date(now - 24 * 60 * 60 * 1000).toISOString()
        );
      }
    } catch (err) {
      console.error("[sqliteDb] demo access flags seed failed:", err);
    }
  }

  // Demo-only historical visits so the occupancy forecast has visible bars.
  if (tenantId === DEFAULT_TENANT_ID && demoSeedAllowed) {
    try {
      const demoMembers = db
        .prepare("SELECT id FROM members WHERE id IN ('mem-8492', 'mem-3109')")
        .all() as Array<{ id: string }>;
      const available = new Set(demoMembers.map((member) => member.id));

      if (available.size > 0) {
        const insertVisit = db.prepare(
          `INSERT OR IGNORE INTO visits
             (id, member_id, checked_in_at, checked_out_at, last_activity_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        const now = new Date();
        const base = new Date(now);
        base.setUTCHours(0, 0, 0, 0);
        const mondayOffset = (base.getUTCDay() + 6) % 7;
        const monday = new Date(base.getTime() - mondayOffset * 86_400_000);

        const patterns: Array<{
          dayOffset: number;
          hour: number;
          minute: number;
          duration: number;
          members: string[];
        }> = [
          { dayOffset: 0, hour: 16, minute: 0, duration: 60, members: ["mem-8492", "mem-3109"] },
          { dayOffset: 1, hour: 7, minute: 0, duration: 45, members: ["mem-8492"] },
          { dayOffset: 2, hour: 17, minute: 30, duration: 75, members: ["mem-8492", "mem-3109"] },
          { dayOffset: 3, hour: 8, minute: 0, duration: 45, members: ["mem-3109"] },
          { dayOffset: 4, hour: 16, minute: 0, duration: 90, members: ["mem-8492", "mem-3109"] },
          { dayOffset: 5, hour: 8, minute: 0, duration: 120, members: ["mem-8492", "mem-3109"] },
          { dayOffset: 6, hour: 9, minute: 0, duration: 60, members: ["mem-3109"] },
        ];

        for (let week = 0; week < 8; week += 1) {
          patterns.forEach((pattern, patternIndex) => {
            const start = new Date(
              monday.getTime() - week * 7 * 86_400_000 + pattern.dayOffset * 86_400_000
            );
            start.setUTCHours(pattern.hour, pattern.minute, 0, 0);
            if (start.getTime() >= now.getTime()) return;

            const end = new Date(start.getTime() + pattern.duration * 60_000);
            for (const memberId of pattern.members) {
              if (!available.has(memberId)) continue;
              insertVisit.run(
                `demo-analytics-${week}-${patternIndex}-${memberId}`,
                memberId,
                start.toISOString(),
                end.toISOString(),
                end.toISOString(),
                start.toISOString()
              );
            }
          });
        }
      }
    } catch (err) {
      console.error("[sqliteDb] demo occupancy analytics seed failed:", err);
    }
  }
}

// Seed the default gym configuration when the tenant has none yet.
export function seedDefaultGymConfig(db: DatabaseSync): void {
  // Seed default site config if empty
  const configStmt = db.prepare(
    "SELECT COUNT(*) as count FROM site_config WHERE key = 'gym_config'"
  );
  const configRow = configStmt.get() as { count: number } | undefined;
  if (!configRow || configRow.count === 0) {
    const insertConfig = db.prepare(
      "INSERT INTO site_config (key, value, updated_at) VALUES (?, ?, ?)"
    );
    insertConfig.run("gym_config", JSON.stringify(defaultGymConfig), new Date().toISOString());
  }
}

// Runs the whole first-connection boot sequence in the original order.
export function initializeDatabase(db: DatabaseSync, tenantId: string): void {
  db.exec(SCHEMA_SQL);
  migrateLegacyPins(db);
  migrateVisitActivity(db);
  seedDemoData(db, tenantId);
  seedDefaultGymConfig(db);
}
