import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import {
  DbMedia,
  DbStaffAccount,
  DbVisit,
  InsideMember,
  MediaInput,
  MediaWithData,
  MemberAccess,
  AuditEntry,
  AuditFilters,
  AuditInput,
  AuditPage,
  AccessAlert,
  AccessEvent,
  AccessEventWithMember,
  MemberNotification,
  MemberNotificationInput,
  MemberSessionInput,
  DbMemberSession,
  StaffAccount,
  StaffInput,
  StaffRole,
  StaffUpdate,
  VisitWithMember,
} from "./db/types";
import { GeneratedWorkoutPlan, GymConfig } from "@/types";
import { defaultGymConfig } from "@/config/gymConfig";
import { hashPin, hashPinSync, verifyPin } from "./passwordHash";
import { envFlag, isDemoMode } from "./flags";

export interface DbMember {
  id: string;
  member_code: string;
  full_name: string;
  email: string;
  pin_code: string;
  tier_name: string;
  has_ai_access: number; // 0 or 1
  subscription_status: string;
  expires_at: string;
  created_at: string;
}

export interface DbWorkoutPlan {
  id: string;
  member_id: string;
  split_name: string;
  split_type: string;
  days_per_week: number;
  session_duration: number;
  plan_json: string;
  created_at: string;
}

export interface DbLeadInquiry {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  goal: string | null;
  preferred_plan: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export const DEFAULT_TENANT_ID = "default";

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

  // Initialize SQLite Schema
  db.exec(`
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
  `);

  // One-time migration: hash any legacy plaintext PINs (idempotent)
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

  // Upgrade visits created before activity tracking existed.
  try {
    const columns = db.prepare("PRAGMA table_info(visits)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "last_activity_at")) {
      db.exec("ALTER TABLE visits ADD COLUMN last_activity_at TEXT");
    }
    db.exec("UPDATE visits SET last_activity_at = checked_in_at WHERE last_activity_at IS NULL");
  } catch (err) {
    console.error("[sqliteDb] visit activity migration failed:", err);
  }

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

  connections.set(tenantId, db);
  return db;
}

// 1. Authenticate Member
export async function getMemberByCredentials(
  identifier: string,
  pin: string,
  tenantId: string = DEFAULT_TENANT_ID
) {
  const db = getDatabase(tenantId);
  const cleanId = identifier.trim();
  const cleanPin = pin.trim();

  const stmt = db.prepare(`
    SELECT * FROM members 
    WHERE LOWER(member_code) = LOWER(?) OR LOWER(email) = LOWER(?)
  `);

  const member = stmt.get(cleanId, cleanId) as DbMember | undefined;
  if (!member || !(await verifyPin(cleanPin, member.pin_code))) return null;

  // Retrieve Saved Plans
  const plansStmt = db.prepare(`
    SELECT * FROM workout_plans 
    WHERE member_id = ? 
    ORDER BY created_at DESC
  `);
  const plans = plansStmt.all(member.id) as unknown as DbWorkoutPlan[];

  const parsedPlans: GeneratedWorkoutPlan[] = plans
    .map((p) => {
      try {
        return JSON.parse(p.plan_json);
      } catch (err) {
        console.error("[sqliteDb] parseMemberPlanJson failed:", err);
        return null;
      }
    })
    .filter((p): p is GeneratedWorkoutPlan => Boolean(p));

  return {
    id: member.id,
    memberCode: member.member_code,
    fullName: member.full_name,
    email: member.email,
    joinedAt: member.created_at.split("T")[0],
    subscription: {
      tier: member.has_ai_access === 1 ? ("all_inclusive_ai" as const) : ("standard" as const),
      tierName: member.tier_name,
      status: member.subscription_status as "active" | "expired",
      expiresAt: member.expires_at,
      autoRenew: true,
      hasAIAccess: member.has_ai_access === 1,
    },
    savedPlans: parsedPlans,
  };
}

// 2. Save Workout Plan
export function saveWorkoutPlanToDb(
  memberId: string,
  plan: GeneratedWorkoutPlan,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  if (typeof plan.id !== "string" || plan.id.trim().length === 0) {
    console.error("[sqliteDb] invalid plan payload:", { memberId, plan });
    return false;
  }
  if (typeof plan.splitName !== "string" || plan.splitName.trim().length === 0) {
    console.error("[sqliteDb] invalid plan payload:", { memberId, plan });
    return false;
  }
  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare(`
      INSERT INTO workout_plans (id, member_id, split_name, split_type, days_per_week, session_duration, plan_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      plan.id || `plan-${Date.now()}`,
      memberId,
      plan.splitName,
      plan.splitType,
      plan.daysPerWeek,
      plan.sessionDuration,
      JSON.stringify(plan),
      plan.createdAt || new Date().toISOString()
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] saveWorkoutPlanToDb failed:", err);
    return false;
  }
}

// 3. Save Lead Inquiry
export function saveLeadInquiryToDb(
  lead: {
    fullName: string;
    email: string;
    phone?: string;
    goal?: string;
    preferredPlan?: string;
    notes?: string;
  },
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const fullName = typeof lead.fullName === "string" ? lead.fullName.trim() : "";
  const notes =
    typeof lead.notes === "string" && lead.notes.length > 2000
      ? lead.notes.slice(0, 2000)
      : lead.notes;

  if (!emailRe.test(lead.email) || fullName.length < 2 || fullName.length > 80) {
    console.error("[sqliteDb] invalid lead payload:", { fullName, email: lead.email });
    return false;
  }

  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare(`
      INSERT INTO lead_inquiries (id, full_name, email, phone, goal, preferred_plan, notes, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      `lead-${Date.now()}`,
      lead.fullName,
      lead.email,
      lead.phone || null,
      lead.goal || null,
      lead.preferredPlan || null,
      notes || null,
      "pending",
      new Date().toISOString()
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] saveLeadInquiryToDb failed:", err);
    return false;
  }
}

// ==============================================================================
// 4. ADMIN MANAGEMENT FUNCTIONS (Structured Admin Panel)
// ==============================================================================

// 4A. Get & Update Gym Configuration
export function getSavedGymConfig(tenantId: string = DEFAULT_TENANT_ID): GymConfig {
  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare("SELECT value FROM site_config WHERE key = 'gym_config'");
    const row = stmt.get() as { value: string } | undefined;
    if (row && row.value) {
      try {
        // Merge over the defaults so a config persisted before a new field
        // existed (e.g. `legal`) still resolves that field for existing installs
        // instead of dropping it. New mandatory legal sections are appended so
        // existing tenants receive cookie/staff/deletion disclosures too.
        const saved = JSON.parse(row.value) as Partial<GymConfig>;
        const merged: GymConfig = { ...defaultGymConfig, ...saved };
        const savedPrivacy = saved.legal?.privacy;
        const savedTos = saved.legal?.tos;

        // Cookie, retention and security disclosures are mandatory: always use
        // the current default bodies for those titles, preserve custom
        // sections, and append newly introduced sections.
        const mandatoryTitles = new Set([
          "3. Cookies & Τοπική Αποθήκευση",
          "5. Διατήρηση Δεδομένων",
          "7. Ασφάλεια",
        ]);
        const privacy = Array.isArray(savedPrivacy)
          ? (() => {
              const savedByTitle = new Map(savedPrivacy.map((section) => [section.title, section]));
              const defaultTitles = new Set(
                defaultGymConfig.legal.privacy.map((section) => section.title)
              );
              return [
                ...defaultGymConfig.legal.privacy.map((section) =>
                  mandatoryTitles.has(section.title)
                    ? section
                    : (savedByTitle.get(section.title) ?? section)
                ),
                ...savedPrivacy.filter((section) => !defaultTitles.has(section.title)),
              ];
            })()
          : defaultGymConfig.legal.privacy;

        const tos = Array.isArray(savedTos)
          ? (() => {
              const titles = new Set(savedTos.map((section) => section.title));
              return [
                ...savedTos,
                ...defaultGymConfig.legal.tos.filter((section) => !titles.has(section.title)),
              ];
            })()
          : defaultGymConfig.legal.tos;

        merged.legal = { tos, privacy };

        // Move the previous template's default address (Athens) to the current
        // White Tower template, but never overwrite a custom address.
        const previousDefaultAddress = "Λεωφόρος Βουλιαγμένης 128, Γλυφάδα";
        const migratedTemplateAddress =
          saved.address === previousDefaultAddress && saved.city === "Αθήνα";
        if (migratedTemplateAddress) {
          merged.address = defaultGymConfig.address;
          merged.city = defaultGymConfig.city;
          if (!saved.phone) merged.phone = defaultGymConfig.phone;
          merged.latitude = defaultGymConfig.latitude;
          merged.longitude = defaultGymConfig.longitude;

          const controller = merged.legal.privacy.find((section) => section.title.startsWith("1."));
          if (controller?.body.includes("Λεωφόρος Βουλιαγμένης 128")) {
            merged.legal.privacy = merged.legal.privacy.map((section) =>
              section === controller
                ? (defaultGymConfig.legal.privacy.find((item) => item.title.startsWith("1.")) ??
                  section)
                : section
            );
          }
        }

        // Do not point an older custom saved address at the new template coordinates.
        if (
          !migratedTemplateAddress &&
          saved.address &&
          (saved.latitude === undefined || saved.longitude === undefined)
        ) {
          merged.latitude = undefined;
          merged.longitude = undefined;
        }

        return merged;
      } catch (err) {
        console.error("[sqliteDb] parseGymConfigJson failed:", err);
      }
    }
  } catch (err) {
    console.error("[sqliteDb] getSavedGymConfig failed:", err);
  }
  return defaultGymConfig;
}

export function updateSavedGymConfig(
  config: Partial<GymConfig>,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const current = getSavedGymConfig(tenantId);
    const merged: GymConfig = { ...current, ...config };

    const stmt = db.prepare(`
      INSERT INTO site_config (key, value, updated_at) 
      VALUES ('gym_config', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(JSON.stringify(merged), new Date().toISOString());
    return true;
  } catch (err) {
    console.error("[sqliteDb] updateSavedGymConfig failed:", err);
    return false;
  }
}

export type DbAdminMember = Omit<DbMember, "pin_code">;

// Server-side member sessions
//
// The signed cookie carries a random session id. Only its SHA-256 hash is stored
// here: a database dump cannot be converted back into a usable cookie. Every
// member API checks this table, so deleting/revoking a row invalidates the
// session immediately even though the cookie itself is still in the browser.

export function createMemberSession(
  input: MemberSessionInput,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    db.prepare(
      `INSERT INTO member_sessions
         (session_id_hash, member_id, created_at, last_seen_at, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.sessionIdHash,
      input.memberId,
      input.createdAt,
      input.lastSeenAt,
      input.expiresAt,
      input.ip ?? null,
      input.userAgent ?? null
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] createMemberSession failed:", err);
    return false;
  }
}

export function getMemberSession(
  sessionIdHash: string,
  tenantId: string = DEFAULT_TENANT_ID
): DbMemberSession | null {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare("SELECT * FROM member_sessions WHERE session_id_hash = ?")
      .get(sessionIdHash) as DbMemberSession | undefined;
    return row ?? null;
  } catch (err) {
    console.error("[sqliteDb] getMemberSession failed:", err);
    return null;
  }
}

export function touchMemberSession(
  sessionIdHash: string,
  lastSeenAt: number,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_sessions
         SET last_seen_at = ?
         WHERE session_id_hash = ? AND revoked_at IS NULL AND expires_at > ?`
      )
      .run(lastSeenAt, sessionIdHash, lastSeenAt);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] touchMemberSession failed:", err);
    return false;
  }
}

export function revokeMemberSession(
  sessionIdHash: string,
  memberId: string,
  revokedAt: number,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_sessions
         SET revoked_at = COALESCE(revoked_at, ?)
         WHERE session_id_hash = ? AND member_id = ?`
      )
      .run(revokedAt, sessionIdHash, memberId);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] revokeMemberSession failed:", err);
    return false;
  }
}

export function revokeAllMemberSessions(
  memberId: string,
  revokedAt: number,
  tenantId: string = DEFAULT_TENANT_ID,
  exceptSessionIdHash?: string
): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_sessions
         SET revoked_at = ?
         WHERE member_id = ? AND revoked_at IS NULL
           AND (? IS NULL OR session_id_hash <> ?)`
      )
      .run(revokedAt, memberId, exceptSessionIdHash ?? null, exceptSessionIdHash ?? null);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] revokeAllMemberSessions failed:", err);
    return 0;
  }
}

export function enforceMemberSessionLimit(
  memberId: string,
  limit: number,
  now: number,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const cap = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = db
      .prepare(
        `SELECT session_id_hash FROM member_sessions
         WHERE member_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC, rowid DESC`
      )
      .all(memberId, now) as Array<{ session_id_hash: string }>;

    if (rows.length <= cap) return 0;

    const revoke = db.prepare(
      "UPDATE member_sessions SET revoked_at = ? WHERE session_id_hash = ? AND revoked_at IS NULL"
    );
    const excess = rows.slice(cap);
    for (const row of excess) {
      revoke.run(now, row.session_id_hash);
    }
    return excess.length;
  } catch (err) {
    console.error("[sqliteDb] enforceMemberSessionLimit failed:", err);
    return 0;
  }
}

export function listMemberSessionHistory(
  memberId: string,
  limit: number = 1000,
  tenantId: string = DEFAULT_TENANT_ID
): DbMemberSession[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        `SELECT * FROM member_sessions
         WHERE member_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(memberId, Math.max(1, Math.min(1000, limit))) as unknown as DbMemberSession[];
  } catch (err) {
    console.error("[sqliteDb] listMemberSessionHistory failed:", err);
    return [];
  }
}

export function listMemberSessions(
  memberId: string,
  activeSince: number,
  now: number,
  tenantId: string = DEFAULT_TENANT_ID
): DbMemberSession[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        `SELECT * FROM member_sessions
         WHERE member_id = ? AND revoked_at IS NULL
           AND expires_at > ? AND last_seen_at > ?
         ORDER BY last_seen_at DESC`
      )
      .all(memberId, now, activeSince) as unknown as DbMemberSession[];
  } catch (err) {
    console.error("[sqliteDb] listMemberSessions failed:", err);
    return [];
  }
}

export function purgeMemberSessions(now: number, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    const db = getDatabase(tenantId);
    const revokedCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const result = db
      .prepare(
        `DELETE FROM member_sessions
         WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)`
      )
      .run(now, revokedCutoff);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] purgeMemberSessions failed:", err);
    return 0;
  }
}

// 4B. Get All Members (pin_code hash excluded from admin listings)
export function getAllMembersAdmin(tenantId: string = DEFAULT_TENANT_ID): DbAdminMember[] {
  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare(
      "SELECT id, member_code, full_name, email, tier_name, has_ai_access, subscription_status, expires_at, created_at FROM members ORDER BY created_at DESC"
    );
    return stmt.all() as DbAdminMember[];
  } catch (err) {
    console.error("[sqliteDb] getAllMembersAdmin failed:", err);
    return [];
  }
}

// 4C. Create or Update Member
export async function upsertMemberAdmin(
  member: {
    id?: string;
    memberCode: string;
    fullName: string;
    email: string;
    pinCode: string;
    tierName: string;
    hasAIAccess: boolean;
    subscriptionStatus: string;
    expiresAt: string;
  },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<boolean> {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const fullName = typeof member.fullName === "string" ? member.fullName.trim() : "";
  const memberCode = typeof member.memberCode === "string" ? member.memberCode.trim() : "";

  if (
    !emailRe.test(member.email) ||
    !/^\d{4,6}$/.test(member.pinCode) ||
    fullName.length < 2 ||
    fullName.length > 80 ||
    memberCode.length < 3
  ) {
    console.error("[sqliteDb] invalid member payload:", {
      memberCode,
      fullName,
      email: member.email,
      pinCode: "[REDACTED]",
    });
    return false;
  }

  try {
    const db = getDatabase(tenantId);
    const memberId = member.id || `mem-${Date.now()}`;
    const normalizedCode = member.memberCode.toUpperCase().trim();
    const existing = db
      .prepare("SELECT id, pin_code FROM members WHERE member_code = ? OR id = ?")
      .get(normalizedCode, member.id ?? "") as { id: string; pin_code: string } | undefined;

    const stmt = db.prepare(`
      INSERT INTO members (id, member_code, full_name, email, pin_code, tier_name, has_ai_access, subscription_status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(member_code) DO UPDATE SET
        full_name = excluded.full_name,
        email = excluded.email,
        pin_code = excluded.pin_code,
        tier_name = excluded.tier_name,
        has_ai_access = excluded.has_ai_access,
        subscription_status = excluded.subscription_status,
        expires_at = excluded.expires_at
    `);

    stmt.run(
      memberId,
      normalizedCode,
      member.fullName.trim(),
      member.email.toLowerCase().trim(),
      await hashPin(member.pinCode.trim()),
      member.tierName.trim(),
      member.hasAIAccess ? 1 : 0,
      member.subscriptionStatus,
      member.expiresAt,
      new Date().toISOString()
    );

    // A PIN change must invalidate every outstanding member session, including
    // a stolen cookie. Other profile edits leave existing sessions alone.
    const actual = db
      .prepare("SELECT id FROM members WHERE member_code = ?")
      .get(normalizedCode) as { id: string } | undefined;
    if (existing && actual && !(await verifyPin(member.pinCode.trim(), existing.pin_code))) {
      revokeAllMemberSessions(actual.id, Date.now(), tenantId);
    }

    return true;
  } catch (err) {
    console.error("[sqliteDb] upsertMemberAdmin failed:", err);
    return false;
  }
}

// 4D. Delete Member
export function deleteMemberAdmin(id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare("DELETE FROM members WHERE id = ?");
    stmt.run(id);
    return true;
  } catch (err) {
    console.error("[sqliteDb] deleteMemberAdmin failed:", err);
    return false;
  }
}

// 4E. Get All Leads & Inquiries
export function getAllLeadsAdmin(tenantId: string = DEFAULT_TENANT_ID): DbLeadInquiry[] {
  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare("SELECT * FROM lead_inquiries ORDER BY created_at DESC");
    return stmt.all() as unknown as DbLeadInquiry[];
  } catch (err) {
    console.error("[sqliteDb] getAllLeadsAdmin failed:", err);
    return [];
  }
}

// 4F. Update Lead Status
export function updateLeadStatusAdmin(
  id: string,
  status: "pending" | "contacted" | "registered",
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare("UPDATE lead_inquiries SET status = ? WHERE id = ?");
    stmt.run(status, id);
    return true;
  } catch (err) {
    console.error("[sqliteDb] updateLeadStatusAdmin failed:", err);
    return false;
  }
}

// ==============================================================================
// 5. DATA-SUBJECT RIGHTS (GDPR): EXPORT, ERASURE, RETENTION
// ==============================================================================

// 5A. Export a member's personal data (right of access / portability).
// The pin hash is deliberately excluded from the export.
export function exportMemberData(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): {
  member: DbAdminMember | null;
  plans: GeneratedWorkoutPlan[];
} {
  try {
    const db = getDatabase(tenantId);
    const member = db
      .prepare(
        "SELECT id, member_code, full_name, email, tier_name, has_ai_access, subscription_status, expires_at, created_at FROM members WHERE id = ?"
      )
      .get(memberId) as DbAdminMember | undefined;

    if (!member) return { member: null, plans: [] };

    const plans = (
      db
        .prepare("SELECT plan_json FROM workout_plans WHERE member_id = ? ORDER BY created_at DESC")
        .all(memberId) as Array<{ plan_json: string }>
    )
      .map((row) => {
        try {
          return JSON.parse(row.plan_json) as GeneratedWorkoutPlan;
        } catch (err) {
          console.error("[sqliteDb] exportMemberData parse failed:", err);
          return null;
        }
      })
      .filter((p): p is GeneratedWorkoutPlan => Boolean(p));

    return { member, plans };
  } catch (err) {
    console.error("[sqliteDb] exportMemberData failed:", err);
    return { member: null, plans: [] };
  }
}

// 5B. Delete a lead inquiry (right to erasure).
export function deleteLeadAdmin(id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    db.prepare("DELETE FROM lead_inquiries WHERE id = ?").run(id);
    return true;
  } catch (err) {
    console.error("[sqliteDb] deleteLeadAdmin failed:", err);
    return false;
  }
}

// 5C. Purge lead inquiries older than the retention window (default 12 months),
// matching the retention stated in the privacy policy.
export function purgeExpiredLeads(months = 12, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    const db = getDatabase(tenantId);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const result = db
      .prepare("DELETE FROM lead_inquiries WHERE created_at < ?")
      .run(cutoff.toISOString());
    return Number(result.changes ?? 0);
  } catch (err) {
    console.error("[sqliteDb] purgeExpiredLeads failed:", err);
    return 0;
  }
}

// 5D. Delete every lead inquiry sharing an email address. A person can exist
// both as a member and as a contact-form lead, so erasure has to cover both.
export function deleteLeadsByEmail(email: string, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare("DELETE FROM lead_inquiries WHERE LOWER(email) = LOWER(?)")
      .run(email);
    return Number(result.changes ?? 0);
  } catch (err) {
    console.error("[sqliteDb] deleteLeadsByEmail failed:", err);
    return 0;
  }
}

const MAX_MEDIA_ITEMS = 60;

// Gallery media (admin uploads). The bytes live in SQLite so they are covered
// by the database backups and by the per-tenant isolation.
export function listMediaAdmin(tenantId: string = DEFAULT_TENANT_ID): DbMedia[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        "SELECT id, filename, mime, size, alt, created_at FROM media ORDER BY created_at DESC"
      )
      .all() as unknown as DbMedia[];
  } catch (err) {
    console.error("[sqliteDb] listMediaAdmin failed:", err);
    return [];
  }
}

export function getMediaWithData(
  id: string,
  tenantId: string = DEFAULT_TENANT_ID
): MediaWithData | null {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare("SELECT id, filename, mime, size, alt, created_at, data FROM media WHERE id = ?")
      .get(id) as (DbMedia & { data: Uint8Array | ArrayBuffer }) | undefined;

    if (!row) return null;
    const data = row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data);
    return { ...row, data };
  } catch (err) {
    console.error("[sqliteDb] getMediaWithData failed:", err);
    return null;
  }
}

export function saveMediaToDb(
  input: MediaInput,
  tenantId: string = DEFAULT_TENANT_ID
): DbMedia | null {
  try {
    const db = getDatabase(tenantId);
    const count = (db.prepare("SELECT COUNT(*) as c FROM media").get() as { c: number }).c;
    if (count >= MAX_MEDIA_ITEMS) return null;

    const id = `media-${randomUUID()}`;
    const createdAt = new Date().toISOString();
    db.prepare(
      "INSERT INTO media (id, filename, mime, size, alt, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, input.filename, input.mime, input.size, input.alt, input.data, createdAt);

    return {
      id,
      filename: input.filename,
      mime: input.mime,
      size: input.size,
      alt: input.alt,
      created_at: createdAt,
    };
  } catch (err) {
    console.error("[sqliteDb] saveMediaToDb failed:", err);
    return null;
  }
}

export function deleteMediaAdmin(id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db.prepare("DELETE FROM media WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] deleteMediaAdmin failed:", err);
    return false;
  }
}

const STALE_VISIT_HOURS = 8;

function staleVisitCutoff(hours: number = STALE_VISIT_HOURS): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function idleVisitCutoff(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function parseStaffPermissions(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function rowToStaffAccount(row: Record<string, unknown>): DbStaffAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: (row.role === "admin" ? "admin" : "trainer") as StaffRole,
    permissions: parseStaffPermissions(row.permissions),
    active: Number(row.active) === 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
    password_hash: String(row.password_hash),
  };
}

function toPublicStaffAccount(account: DbStaffAccount): StaffAccount {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    permissions: account.permissions,
    active: account.active,
    created_at: account.created_at,
    updated_at: account.updated_at,
    last_login_at: account.last_login_at,
  };
}

export function listStaffAccounts(tenantId: string = DEFAULT_TENANT_ID): StaffAccount[] {
  try {
    const db = getDatabase(tenantId);
    return (
      db.prepare("SELECT * FROM staff_accounts ORDER BY created_at ASC").all() as Record<
        string,
        unknown
      >[]
    ).map((row) => toPublicStaffAccount(rowToStaffAccount(row)));
  } catch (err) {
    console.error("[sqliteDb] listStaffAccounts failed:", err);
    return [];
  }
}

export function getStaffAccountById(
  id: string,
  tenantId: string = DEFAULT_TENANT_ID
): DbStaffAccount | null {
  try {
    const db = getDatabase(tenantId);
    const row = db.prepare("SELECT * FROM staff_accounts WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;
    return row ? rowToStaffAccount(row) : null;
  } catch (err) {
    console.error("[sqliteDb] getStaffAccountById failed:", err);
    return null;
  }
}

export function getStaffAccountByEmail(
  email: string,
  tenantId: string = DEFAULT_TENANT_ID
): DbStaffAccount | null {
  try {
    const db = getDatabase(tenantId);
    const normalized = email.trim().toLowerCase();
    const row = db.prepare("SELECT * FROM staff_accounts WHERE email = ?").get(normalized) as
      Record<string, unknown> | undefined;
    return row ? rowToStaffAccount(row) : null;
  } catch (err) {
    console.error("[sqliteDb] getStaffAccountByEmail failed:", err);
    return null;
  }
}

export async function createStaffAccount(
  input: StaffInput,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<StaffAccount | null> {
  try {
    const db = getDatabase(tenantId);
    const id = `staff-${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO staff_accounts
         (id, name, email, role, password_hash, permissions, active, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.name.trim(),
      input.email.trim().toLowerCase(),
      input.role,
      await hashPin(input.password),
      JSON.stringify(input.permissions ?? []),
      1,
      now,
      now,
      null
    );

    const account = getStaffAccountById(id, tenantId);
    return account ? toPublicStaffAccount(account) : null;
  } catch (err) {
    console.error("[sqliteDb] createStaffAccount failed:", err);
    return null;
  }
}

export async function updateStaffAccount(
  id: string,
  patch: StaffUpdate,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<StaffAccount | null> {
  try {
    const db = getDatabase(tenantId);
    const current = getStaffAccountById(id, tenantId);
    if (!current) return null;

    const fields: string[] = [];
    const values: Array<string | number> = [];

    if (typeof patch.name === "string") {
      fields.push("name = ?");
      values.push(patch.name.trim());
    }
    if (typeof patch.email === "string") {
      fields.push("email = ?");
      values.push(patch.email.trim().toLowerCase());
    }
    if (patch.role === "admin" || patch.role === "trainer") {
      fields.push("role = ?");
      values.push(patch.role);
    }
    if (typeof patch.password === "string") {
      fields.push("password_hash = ?");
      values.push(await hashPin(patch.password));
    }
    if (Array.isArray(patch.permissions)) {
      fields.push("permissions = ?");
      values.push(JSON.stringify(patch.permissions));
    }
    if (typeof patch.active === "boolean") {
      fields.push("active = ?");
      values.push(patch.active ? 1 : 0);
    }

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());

    db.prepare(`UPDATE staff_accounts SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);

    const account = getStaffAccountById(id, tenantId);
    return account ? toPublicStaffAccount(account) : null;
  } catch (err) {
    console.error("[sqliteDb] updateStaffAccount failed:", err);
    return null;
  }
}

export function deleteStaffAccount(id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db.prepare("DELETE FROM staff_accounts WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] deleteStaffAccount failed:", err);
    return false;
  }
}

export function touchStaffLogin(id: string, tenantId: string = DEFAULT_TENANT_ID): void {
  try {
    const db = getDatabase(tenantId);
    const now = new Date().toISOString();
    db.prepare("UPDATE staff_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?").run(
      now,
      now,
      id
    );
  } catch (err) {
    console.error("[sqliteDb] touchStaffLogin failed:", err);
  }
}

function rowToAuditEntry(row: Record<string, unknown>): AuditEntry {
  let details: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.details ?? "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      details = parsed as Record<string, unknown>;
    }
  } catch {
    details = {};
  }

  return {
    id: String(row.id),
    actor_id: row.actor_id ? String(row.actor_id) : null,
    actor_name: String(row.actor_name),
    actor_email: row.actor_email ? String(row.actor_email) : null,
    actor_role: String(row.actor_role),
    actor_legacy: Number(row.actor_legacy) === 1,
    action: String(row.action),
    entity_type: String(row.entity_type),
    entity_id: row.entity_id ? String(row.entity_id) : null,
    details,
    ip: row.ip ? String(row.ip) : null,
    created_at: String(row.created_at),
  };
}

export function insertAuditEntry(input: AuditInput, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    db.prepare(
      `INSERT INTO audit_log
         (id, actor_id, actor_name, actor_email, actor_role, actor_legacy,
          action, entity_type, entity_id, details, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `audit-${randomUUID()}`,
      input.actorId ?? null,
      input.actorName,
      input.actorEmail ?? null,
      input.actorRole,
      input.actorLegacy ? 1 : 0,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.details ?? {}),
      input.ip ?? null,
      new Date().toISOString()
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] insertAuditEntry failed:", err);
    return false;
  }
}

export function listAuditEntries(
  filters: AuditFilters = {},
  tenantId: string = DEFAULT_TENANT_ID
): AuditPage {
  try {
    const db = getDatabase(tenantId);
    const limit = Math.min(
      200,
      Math.max(1, Number.isFinite(filters.limit) ? Number(filters.limit) : 50)
    );
    const offset = Math.max(0, Number.isFinite(filters.offset) ? Number(filters.offset) : 0);

    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.action) {
      clauses.push("action = ?");
      params.push(filters.action);
    }
    if (filters.entityType) {
      clauses.push("entity_type = ?");
      params.push(filters.entityType);
    }
    if (filters.actorId) {
      clauses.push("actor_id = ?");
      params.push(filters.actorId);
    }
    if (filters.from) {
      clauses.push("created_at >= ?");
      params.push(filters.from);
    }
    if (filters.to) {
      clauses.push("created_at <= ?");
      params.push(filters.to);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const totalRow = db.prepare(`SELECT COUNT(*) as c FROM audit_log ${where}`).get(...params) as {
      c: number;
    };
    const rows = db
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Record<string, unknown>[];

    return {
      entries: rows.map(rowToAuditEntry),
      total: totalRow.c,
      limit,
      offset,
    };
  } catch (err) {
    console.error("[sqliteDb] listAuditEntries failed:", err);
    return { entries: [], total: 0, limit: 50, offset: 0 };
  }
}

// Audit records are retained for accountability, but the personal identifiers
// of a deleted staff actor are removed from the history.
export function anonymizeStaffAudit(staffId: string, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE audit_log
         SET actor_id = NULL, actor_name = 'Διαγραμμένος λογαριασμός', actor_email = NULL
         WHERE actor_id = ?`
      )
      .run(staffId);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] anonymizeStaffAudit failed:", err);
    return 0;
  }
}

export function purgeAuditLog(days: number = 365, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    if (!Number.isFinite(days) || days <= 0) return 0;
    const db = getDatabase(tenantId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(cutoff);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] purgeAuditLog failed:", err);
    return 0;
  }
}

function rowToMemberNotification(row: Record<string, unknown>): MemberNotification {
  return {
    id: String(row.id),
    member_id: String(row.member_id),
    type: String(row.type),
    title: String(row.title),
    body: String(row.body),
    dedupe_key: String(row.dedupe_key),
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at),
  };
}

export function ensureMemberNotification(
  memberId: string,
  input: MemberNotificationInput,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO member_notifications
           (id, member_id, type, title, body, dedupe_key, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `notification-${randomUUID()}`,
        memberId,
        input.type,
        input.title,
        input.body,
        input.dedupeKey,
        null,
        new Date().toISOString()
      );
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] ensureMemberNotification failed:", err);
    return false;
  }
}

export function listMemberNotifications(
  memberId: string,
  limit: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): MemberNotification[] {
  try {
    const db = getDatabase(tenantId);
    const safeLimit = Math.min(100, Math.max(1, Number.isFinite(limit) ? limit : 50));
    return (
      db
        .prepare(
          `SELECT * FROM member_notifications
           WHERE member_id = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(memberId, safeLimit) as Record<string, unknown>[]
    ).map(rowToMemberNotification);
  } catch (err) {
    console.error("[sqliteDb] listMemberNotifications failed:", err);
    return [];
  }
}

export function getUnreadNotificationCount(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare(
        `SELECT COUNT(*) as c FROM member_notifications
         WHERE member_id = ? AND read_at IS NULL`
      )
      .get(memberId) as { c: number };
    return row.c;
  } catch (err) {
    console.error("[sqliteDb] getUnreadNotificationCount failed:", err);
    return 0;
  }
}

export function markMemberNotificationRead(
  memberId: string,
  notificationId: string,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_notifications SET read_at = ?
         WHERE id = ? AND member_id = ? AND read_at IS NULL`
      )
      .run(new Date().toISOString(), notificationId, memberId);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] markMemberNotificationRead failed:", err);
    return false;
  }
}

export function markAllMemberNotificationsRead(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE member_notifications SET read_at = ?
         WHERE member_id = ? AND read_at IS NULL`
      )
      .run(new Date().toISOString(), memberId);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] markAllMemberNotificationsRead failed:", err);
    return 0;
  }
}

function rowToAccessEvent(row: Record<string, unknown>): AccessEvent {
  let details: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.details ?? "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      details = parsed as Record<string, unknown>;
    }
  } catch {
    details = {};
  }

  return {
    id: String(row.id),
    member_id: String(row.member_id),
    event_type: String(row.event_type),
    details,
    created_at: String(row.created_at),
  };
}

export function recordAccessEvent(
  memberId: string,
  eventType: string,
  details: Record<string, unknown> = {},
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    db.prepare(
      `INSERT INTO access_events (id, member_id, event_type, details, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      `access-event-${randomUUID()}`,
      memberId,
      eventType,
      JSON.stringify(details),
      new Date().toISOString()
    );
    return true;
  } catch (err) {
    console.error("[sqliteDb] recordAccessEvent failed:", err);
    return false;
  }
}

export function getLastCheckoutAt(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): string | null {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare(
        `SELECT checked_out_at FROM visits
         WHERE member_id = ? AND checked_out_at IS NOT NULL
         ORDER BY checked_out_at DESC LIMIT 1`
      )
      .get(memberId) as { checked_out_at: string } | undefined;
    return row?.checked_out_at ?? null;
  } catch (err) {
    console.error("[sqliteDb] getLastCheckoutAt failed:", err);
    return null;
  }
}

export function countAccessEvents(
  memberId: string,
  days: number = 7,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const row = db
      .prepare("SELECT COUNT(*) as c FROM access_events WHERE member_id = ? AND created_at >= ?")
      .get(memberId, since) as { c: number };
    return row.c;
  } catch (err) {
    console.error("[sqliteDb] countAccessEvents failed:", err);
    return 0;
  }
}

export function listAccessAlerts(
  threshold: number = 1,
  days: number = 7,
  tenantId: string = DEFAULT_TENANT_ID
): AccessAlert[] {
  try {
    const db = getDatabase(tenantId);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = db
      .prepare(
        `SELECT e.member_id, m.member_code, m.full_name,
                COUNT(*) as event_count,
                MAX(e.created_at) as last_event_at,
                GROUP_CONCAT(DISTINCT e.event_type) as event_types
         FROM access_events e
         JOIN members m ON m.id = e.member_id
         WHERE e.created_at >= ?
         GROUP BY e.member_id
         HAVING COUNT(*) > ?
         ORDER BY event_count DESC, last_event_at DESC`
      )
      .all(since, threshold) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      member_id: String(row.member_id),
      member_code: String(row.member_code),
      full_name: String(row.full_name),
      event_count: Number(row.event_count),
      last_event_at: String(row.last_event_at),
      event_types: String(row.event_types ?? "")
        .split(",")
        .filter(Boolean),
    }));
  } catch (err) {
    console.error("[sqliteDb] listAccessAlerts failed:", err);
    return [];
  }
}

export function listMemberAccessEvents(
  memberId: string,
  limit: number = 1000,
  tenantId: string = DEFAULT_TENANT_ID
): AccessEvent[] {
  try {
    const db = getDatabase(tenantId);
    const safeLimit = Math.min(1000, Math.max(1, limit));
    return (
      db
        .prepare(
          `SELECT * FROM access_events
           WHERE member_id = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(memberId, safeLimit) as Record<string, unknown>[]
    ).map(rowToAccessEvent);
  } catch (err) {
    console.error("[sqliteDb] listMemberAccessEvents failed:", err);
    return [];
  }
}

export function listRecentAccessEvents(
  limit: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): AccessEventWithMember[] {
  try {
    const db = getDatabase(tenantId);
    const safeLimit = Math.min(200, Math.max(1, limit));
    const rows = db
      .prepare(
        `SELECT e.*, m.member_code, m.full_name
         FROM access_events e
         JOIN members m ON m.id = e.member_id
         ORDER BY e.created_at DESC LIMIT ?`
      )
      .all(safeLimit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      ...rowToAccessEvent(row),
      member_code: String(row.member_code),
      full_name: String(row.full_name),
    }));
  } catch (err) {
    console.error("[sqliteDb] listRecentAccessEvents failed:", err);
    return [];
  }
}

export function purgeAccessEvents(
  days: number = 365,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    if (!Number.isFinite(days) || days <= 0) return 0;
    const db = getDatabase(tenantId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare("DELETE FROM access_events WHERE created_at < ?").run(cutoff);
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] purgeAccessEvents failed:", err);
    return 0;
  }
}

export function getMemberAccess(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): MemberAccess | null {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare(
        `SELECT id, member_code, full_name, subscription_status, expires_at, has_ai_access
         FROM members WHERE id = ?`
      )
      .get(memberId) as MemberAccess | undefined;
    return row ?? null;
  } catch (err) {
    console.error("[sqliteDb] getMemberAccess failed:", err);
    return null;
  }
}

export function getReentryCooldownSeconds(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const minutes = getSavedGymConfig(tenantId).reentryCooldownMinutes || 0;
    if (minutes <= 0) return 0;

    const last = db
      .prepare(
        `SELECT checked_out_at FROM visits
         WHERE member_id = ? AND checked_out_at IS NOT NULL
         ORDER BY checked_out_at DESC LIMIT 1`
      )
      .get(memberId) as { checked_out_at: string } | undefined;

    if (!last) return 0;
    const elapsedMs = Date.now() - Date.parse(last.checked_out_at);
    if (!Number.isFinite(elapsedMs)) return 0;
    const remainingMs = minutes * 60_000 - elapsedMs;
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  } catch (err) {
    console.error("[sqliteDb] getReentryCooldownSeconds failed:", err);
    return 0;
  }
}

export function getMemberVisitStatus(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): { inside: boolean; since: string | null } {
  try {
    const db = getDatabase(tenantId);
    const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
    const activityCutoff = idleMinutes > 0 ? idleVisitCutoff(idleMinutes) : null;
    const row = db
      .prepare(
        `SELECT checked_in_at FROM visits
         WHERE member_id = ? AND checked_out_at IS NULL AND checked_in_at >= ?
           AND (? IS NULL OR COALESCE(last_activity_at, checked_in_at) >= ?)
         ORDER BY checked_in_at DESC LIMIT 1`
      )
      .get(memberId, staleVisitCutoff(), activityCutoff, activityCutoff) as
      { checked_in_at: string } | undefined;

    return { inside: Boolean(row), since: row?.checked_in_at ?? null };
  } catch (err) {
    console.error("[sqliteDb] getMemberVisitStatus failed:", err);
    return { inside: false, since: null };
  }
}

export function checkInMember(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): { status: "in" | "already_in" | "unknown"; visit?: DbVisit } {
  try {
    const db = getDatabase(tenantId);
    const member = db.prepare("SELECT id FROM members WHERE id = ?").get(memberId);
    if (!member) return { status: "unknown" };

    const now = new Date().toISOString();
    // A forgotten check-out should not keep someone "inside" forever.
    db.prepare(
      `UPDATE visits SET checked_out_at = ?
       WHERE member_id = ? AND checked_out_at IS NULL AND checked_in_at < ?`
    ).run(now, memberId, staleVisitCutoff());

    const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
    if (idleMinutes > 0) {
      db.prepare(
        `UPDATE visits SET checked_out_at = ?
         WHERE member_id = ? AND checked_out_at IS NULL
           AND COALESCE(last_activity_at, checked_in_at) < ?`
      ).run(now, memberId, idleVisitCutoff(idleMinutes));
    }

    const open = db
      .prepare(
        `SELECT * FROM visits
         WHERE member_id = ? AND checked_out_at IS NULL
         ORDER BY checked_in_at DESC LIMIT 1`
      )
      .get(memberId) as DbVisit | undefined;

    if (open) return { status: "already_in", visit: open };

    const visit: DbVisit = {
      id: `visit-${randomUUID()}`,
      member_id: memberId,
      checked_in_at: now,
      checked_out_at: null,
      last_activity_at: now,
      created_at: now,
    };
    db.prepare(
      "INSERT INTO visits (id, member_id, checked_in_at, checked_out_at, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      visit.id,
      visit.member_id,
      visit.checked_in_at,
      visit.checked_out_at,
      visit.last_activity_at,
      visit.created_at
    );

    return { status: "in", visit };
  } catch (err) {
    console.error("[sqliteDb] checkInMember failed:", err);
    return { status: "unknown" };
  }
}

export function checkOutMember(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): { status: "out" | "not_in"; visit?: DbVisit } {
  try {
    const db = getDatabase(tenantId);
    const open = db
      .prepare(
        `SELECT * FROM visits
         WHERE member_id = ? AND checked_out_at IS NULL
         ORDER BY checked_in_at DESC LIMIT 1`
      )
      .get(memberId) as DbVisit | undefined;

    if (!open) return { status: "not_in" };

    const now = new Date().toISOString();
    db.prepare("UPDATE visits SET checked_out_at = ? WHERE id = ?").run(now, open.id);
    return { status: "out", visit: { ...open, checked_out_at: now } };
  } catch (err) {
    console.error("[sqliteDb] checkOutMember failed:", err);
    return { status: "not_in" };
  }
}

export function getOccupancy(tenantId: string = DEFAULT_TENANT_ID): {
  inside: number;
  capacity: number;
} {
  try {
    const db = getDatabase(tenantId);
    const config = getSavedGymConfig(tenantId);
    const idleMinutes = config.idleCheckoutMinutes || 0;
    const activityCutoff = idleMinutes > 0 ? idleVisitCutoff(idleMinutes) : null;
    const row = db
      .prepare(
        `SELECT COUNT(*) as c FROM visits
         WHERE checked_out_at IS NULL AND checked_in_at >= ?
           AND (? IS NULL OR COALESCE(last_activity_at, checked_in_at) >= ?)`
      )
      .get(staleVisitCutoff(), activityCutoff, activityCutoff) as { c: number };

    return {
      inside: row.c,
      capacity: config.capacity || 0,
    };
  } catch (err) {
    console.error("[sqliteDb] getOccupancy failed:", err);
    return { inside: 0, capacity: 0 };
  }
}

export function getInsideMembers(tenantId: string = DEFAULT_TENANT_ID): InsideMember[] {
  try {
    const db = getDatabase(tenantId);
    const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
    const activityCutoff = idleMinutes > 0 ? idleVisitCutoff(idleMinutes) : null;
    return db
      .prepare(
        `SELECT v.member_id, m.member_code, m.full_name, v.checked_in_at
         FROM visits v JOIN members m ON m.id = v.member_id
         WHERE v.checked_out_at IS NULL AND v.checked_in_at >= ?
           AND (? IS NULL OR COALESCE(v.last_activity_at, v.checked_in_at) >= ?)
         ORDER BY v.checked_in_at ASC`
      )
      .all(staleVisitCutoff(), activityCutoff, activityCutoff) as unknown as InsideMember[];
  } catch (err) {
    console.error("[sqliteDb] getInsideMembers failed:", err);
    return [];
  }
}

// Any member action (portal heartbeat, weight log, plan save) keeps the open
// visit alive so idle auto-checkout does not close an active workout.
export function touchMemberVisit(memberId: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const idleMinutes = getSavedGymConfig(tenantId).idleCheckoutMinutes || 0;
    const activityCutoff = idleMinutes > 0 ? idleVisitCutoff(idleMinutes) : null;

    // Do not revive a visit that has already crossed the idle threshold.
    const result = db
      .prepare(
        `UPDATE visits SET last_activity_at = ?
         WHERE id = (
           SELECT id FROM visits
           WHERE member_id = ? AND checked_out_at IS NULL
             AND checked_in_at >= ?
             AND (? IS NULL OR COALESCE(last_activity_at, checked_in_at) >= ?)
           ORDER BY checked_in_at DESC LIMIT 1
         )`
      )
      .run(new Date().toISOString(), memberId, staleVisitCutoff(), activityCutoff, activityCutoff);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] touchMemberVisit failed:", err);
    return false;
  }
}

export function closeIdleVisits(minutes: number, tenantId: string = DEFAULT_TENANT_ID): number {
  try {
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        `UPDATE visits SET checked_out_at = ?
         WHERE checked_out_at IS NULL
           AND COALESCE(last_activity_at, checked_in_at) < ?`
      )
      .run(new Date().toISOString(), idleVisitCutoff(minutes));
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] closeIdleVisits failed:", err);
    return 0;
  }
}

export function getMemberVisitCount(
  memberId: string,
  days: number = 30,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const row = db
      .prepare("SELECT COUNT(*) as c FROM visits WHERE member_id = ? AND checked_in_at >= ?")
      .get(memberId, cutoff) as { c: number };
    return row.c;
  } catch (err) {
    console.error("[sqliteDb] getMemberVisitCount failed:", err);
    return 0;
  }
}

export function getMemberVisits(
  memberId: string,
  limit: number = 20,
  tenantId: string = DEFAULT_TENANT_ID
): DbVisit[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare("SELECT * FROM visits WHERE member_id = ? ORDER BY checked_in_at DESC LIMIT ?")
      .all(memberId, limit) as unknown as DbVisit[];
  } catch (err) {
    console.error("[sqliteDb] getMemberVisits failed:", err);
    return [];
  }
}

export function getVisitIntervalsSince(
  since: string,
  tenantId: string = DEFAULT_TENANT_ID
): Array<{ checked_in_at: string; checked_out_at: string | null }> {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        `SELECT checked_in_at, checked_out_at FROM visits
         WHERE checked_in_at >= ?
         ORDER BY checked_in_at ASC`
      )
      .all(since) as Array<{
      checked_in_at: string;
      checked_out_at: string | null;
    }>;
  } catch (err) {
    console.error("[sqliteDb] getVisitIntervalsSince failed:", err);
    return [];
  }
}

export function getRecentVisits(
  limit: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): VisitWithMember[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        `SELECT v.*, m.member_code, m.full_name
         FROM visits v JOIN members m ON m.id = v.member_id
         ORDER BY v.checked_in_at DESC LIMIT ?`
      )
      .all(limit) as unknown as VisitWithMember[];
  } catch (err) {
    console.error("[sqliteDb] getRecentVisits failed:", err);
    return [];
  }
}

export function closeStaleVisits(
  hours: number = STALE_VISIT_HOURS,
  tenantId: string = DEFAULT_TENANT_ID
): number {
  try {
    const db = getDatabase(tenantId);
    const result = db
      .prepare(
        "UPDATE visits SET checked_out_at = ? WHERE checked_out_at IS NULL AND checked_in_at < ?"
      )
      .run(new Date().toISOString(), staleVisitCutoff(hours));
    return Number(result.changes);
  } catch (err) {
    console.error("[sqliteDb] closeStaleVisits failed:", err);
    return 0;
  }
}

// 5E. Complete GDPR erasure: removes the member (cascading to their workout
// plans) together with any lead inquiries sharing their email, atomically.
export function eraseMemberCompletely(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const member = db.prepare("SELECT email FROM members WHERE id = ?").get(memberId) as
      { email: string } | undefined;
    if (!member) return false;

    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM lead_inquiries WHERE LOWER(email) = LOWER(?)").run(member.email);
      db.prepare("DELETE FROM members WHERE id = ?").run(memberId);
      db.exec("COMMIT");
      return true;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("[sqliteDb] eraseMemberCompletely failed:", err);
    return false;
  }
}
