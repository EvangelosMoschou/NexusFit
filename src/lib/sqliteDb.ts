import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { GeneratedWorkoutPlan, GymConfig } from "@/types";
import { defaultGymConfig } from "@/config/gymConfig";
import { hashPin, verifyPin } from "./passwordHash";
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
  `);

  // One-time migration: hash any legacy plaintext PINs (idempotent)
  try {
    const rows = db.prepare("SELECT id, pin_code FROM members").all() as Array<{ id: string; pin_code: string }>;
    const updateStmt = db.prepare("UPDATE members SET pin_code = ? WHERE id = ?");
    for (const row of rows) {
      if (typeof row.pin_code === "string" && !row.pin_code.startsWith("scrypt:")) {
        updateStmt.run(hashPin(row.pin_code), row.id);
      }
    }
  } catch (err) {
    console.error("[sqliteDb] pin migration failed:", err);
  }

  // Seed default demo members only for the default tenant and only when it is
  // safe to do so: a real deployment must not ship accounts with known
  // credentials (NX-8492 / PIN 1234). Production therefore requires an explicit
  // SEED_DEMO_MEMBERS=1 opt-in, which exists for throwaway demo instances.
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM members");
  const row = countStmt.get() as { count: number } | undefined;
  const demoSeedAllowed =
    process.env.NODE_ENV !== "production" ||
    isDemoMode() ||
    envFlag(process.env.SEED_DEMO_MEMBERS);

  if (tenantId === DEFAULT_TENANT_ID && demoSeedAllowed && (!row || row.count === 0)) {
    const insertMember = db.prepare(`
      INSERT INTO members (id, member_code, full_name, email, pin_code, tier_name, has_ai_access, subscription_status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMember.run(
      "mem-8492",
      "NX-8492",
      "Γεώργιος Παπαδόπουλος",
      "george@nexusathletics.gr",
      hashPin("1234"),
      "All-Access & NexusFit AI Copilot (45€ + 14€/mo)",
      1,
      "active",
      "2026-12-31",
      new Date().toISOString()
    );

    insertMember.run(
      "mem-3109",
      "NX-3109",
      "Μαρία Κωνσταντίνου",
      "maria@nexusathletics.gr",
      hashPin("1234"),
      "Standard Gym Access (45€/mo)",
      0,
      "active",
      "2026-10-15",
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

  // Seed default site config if empty
  const configStmt = db.prepare("SELECT COUNT(*) as count FROM site_config WHERE key = 'gym_config'");
  const configRow = configStmt.get() as { count: number } | undefined;
  if (!configRow || configRow.count === 0) {
    const insertConfig = db.prepare("INSERT INTO site_config (key, value, updated_at) VALUES (?, ?, ?)");
    insertConfig.run("gym_config", JSON.stringify(defaultGymConfig), new Date().toISOString());
  }

  connections.set(tenantId, db);
  return db;
}

// 1. Authenticate Member
export function getMemberByCredentials(
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
  if (!member || !verifyPin(cleanPin, member.pin_code)) return null;

  // Retrieve Saved Plans
  const plansStmt = db.prepare(`
    SELECT * FROM workout_plans 
    WHERE member_id = ? 
    ORDER BY created_at DESC
  `);
  const plans = plansStmt.all(member.id) as unknown as DbWorkoutPlan[];

  const parsedPlans: GeneratedWorkoutPlan[] = plans.map((p) => {
    try {
      return JSON.parse(p.plan_json);
    } catch (err) {
      console.error("[sqliteDb] parseMemberPlanJson failed:", err);
      return null;
    }
  }).filter((p): p is GeneratedWorkoutPlan => Boolean(p));

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
  lead: { fullName: string; email: string; phone?: string; goal?: string; preferredPlan?: string; notes?: string },
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const fullName = typeof lead.fullName === "string" ? lead.fullName.trim() : "";
  const notes = typeof lead.notes === "string" && lead.notes.length > 2000 ? lead.notes.slice(0, 2000) : lead.notes;

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
        // instead of dropping it.
        return { ...defaultGymConfig, ...JSON.parse(row.value) };
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
export function upsertMemberAdmin(member: {
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
): boolean {
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
    console.error("[sqliteDb] invalid member payload:", { memberCode, fullName, email: member.email, pinCode: "[REDACTED]" });
    return false;
  }

  try {
    const db = getDatabase(tenantId);
    const memberId = member.id || `mem-${Date.now()}`;
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
      member.memberCode.toUpperCase().trim(),
      member.fullName.trim(),
      member.email.toLowerCase().trim(),
      hashPin(member.pinCode.trim()),
      member.tierName.trim(),
      member.hasAIAccess ? 1 : 0,
      member.subscriptionStatus,
      member.expiresAt,
      new Date().toISOString()
    );
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
export function exportMemberData(memberId: string, tenantId: string = DEFAULT_TENANT_ID): {
  member: DbAdminMember | null;
  plans: GeneratedWorkoutPlan[];
} {
  try {
    const db = getDatabase(tenantId);
    const member = db.prepare(
      "SELECT id, member_code, full_name, email, tier_name, has_ai_access, subscription_status, expires_at, created_at FROM members WHERE id = ?"
    ).get(memberId) as DbAdminMember | undefined;

    if (!member) return { member: null, plans: [] };

    const plans = (db.prepare(
      "SELECT plan_json FROM workout_plans WHERE member_id = ? ORDER BY created_at DESC"
    ).all(memberId) as Array<{ plan_json: string }>)
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
    const result = db.prepare("DELETE FROM lead_inquiries WHERE created_at < ?").run(cutoff.toISOString());
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
    const result = db.prepare("DELETE FROM lead_inquiries WHERE LOWER(email) = LOWER(?)").run(email);
    return Number(result.changes ?? 0);
  } catch (err) {
    console.error("[sqliteDb] deleteLeadsByEmail failed:", err);
    return 0;
  }
}

// 5E. Complete GDPR erasure: removes the member (cascading to their workout
// plans) together with any lead inquiries sharing their email, atomically.
export function eraseMemberCompletely(memberId: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const member = db.prepare("SELECT email FROM members WHERE id = ?").get(memberId) as
      | { email: string }
      | undefined;
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
