import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type {
  DbAdminMember,
  DbMember,
  DbWorkoutPlan,
  MemberAccess,
  MemberSession,
  MemberUpdateInput,
  MemberUpdateResult,
} from "./types";
import type { GeneratedWorkoutPlan } from "@/types";
import { DUMMY_SCRYPT_HASH, hashPin, verifyPin } from "@/lib/passwordHash";
import { revokeAllMemberSessions } from "./memberSessions";

// Member records, workout plans and the GDPR access/erasure paths.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^\d{4,6}$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WORKOUT_PLAN_BYTES = 65_536;

function isValidIsoDate(value: string): boolean {
  if (!DATE_ISO_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function buildMemberSession(db: DatabaseSync, member: DbMember): MemberSession {
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

export async function getMemberByCredentials(
  identifier: string,
  pin: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<MemberSession | null> {
  const db = getDatabase(tenantId);
  const cleanId = identifier.trim();
  const cleanPin = pin.trim();

  const stmt = db.prepare(`
    SELECT * FROM members 
    WHERE member_code = UPPER(?) OR email = LOWER(?)
  `);

  const member = stmt.get(cleanId, cleanId) as DbMember | undefined;
  if (!member) {
    await verifyPin(cleanPin, DUMMY_SCRYPT_HASH);
    return null;
  }
  if (!(await verifyPin(cleanPin, member.pin_code))) return null;

  return buildMemberSession(db, member);
}

export function getMemberById(
  memberId: string,
  tenantId: string = DEFAULT_TENANT_ID
): MemberSession | null {
  if (!memberId) return null;
  try {
    const db = getDatabase(tenantId);
    const member = db.prepare("SELECT * FROM members WHERE id = ?").get(memberId) as
      | DbMember
      | undefined;
    return member ? buildMemberSession(db, member) : null;
  } catch (err) {
    console.error("[sqliteDb] getMemberById failed:", err);
    return null;
  }
}

export function saveWorkoutPlanToDb(
  memberId: string,
  plan: GeneratedWorkoutPlan,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return false;
  }
  const id = typeof plan.id === "string" ? plan.id.trim() : "";
  const splitName = typeof plan.splitName === "string" ? plan.splitName.trim() : "";
  if (!id || id.length > 100 || !splitName || splitName.length > 120) {
    console.error("[sqliteDb] invalid plan payload:", { memberId, plan });
    return false;
  }
  if (!Array.isArray(plan.days) || plan.days.length > 7) {
    console.error("[sqliteDb] invalid plan days payload:", { memberId, id });
    return false;
  }

  const serialized = JSON.stringify(plan);
  if (Buffer.byteLength(serialized, "utf8") > MAX_WORKOUT_PLAN_BYTES) {
    console.error("[sqliteDb] workout plan payload exceeds 64 KB cap:", { memberId, id });
    return false;
  }

  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare(`
      INSERT INTO workout_plans (id, member_id, split_name, split_type, days_per_week, session_duration, plan_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        split_name = excluded.split_name,
        split_type = excluded.split_type,
        days_per_week = excluded.days_per_week,
        session_duration = excluded.session_duration,
        plan_json = excluded.plan_json
      WHERE workout_plans.member_id = excluded.member_id
    `);

    const result = stmt.run(
      id,
      memberId,
      splitName,
      typeof plan.splitType === "string" ? plan.splitType : "custom",
      Number.isFinite(Number(plan.daysPerWeek)) ? Number(plan.daysPerWeek) : plan.days.length,
      Number.isFinite(Number(plan.sessionDuration)) ? Number(plan.sessionDuration) : 60,
      serialized,
      typeof plan.createdAt === "string" && plan.createdAt ? plan.createdAt : new Date().toISOString()
    );
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] saveWorkoutPlanToDb failed:", err);
    return false;
  }
}

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
  const fullName = typeof member.fullName === "string" ? member.fullName.trim() : "";
  const memberCode = typeof member.memberCode === "string" ? member.memberCode.trim() : "";
  const email = typeof member.email === "string" ? member.email.trim() : "";
  const pinCode = typeof member.pinCode === "string" ? member.pinCode.trim() : "";

  if (
    !EMAIL_RE.test(email) ||
    !PIN_RE.test(pinCode) ||
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
    const normalizedCode = memberCode.toUpperCase();
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
      fullName,
      email.toLowerCase(),
      await hashPin(pinCode),
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
    if (existing && actual && !(await verifyPin(pinCode, existing.pin_code))) {
      revokeAllMemberSessions(actual.id, Date.now(), tenantId);
    }

    return true;
  } catch (err) {
    console.error("[sqliteDb] upsertMemberAdmin failed:", err);
    return false;
  }
}

export async function updateMemberAdmin(
  id: string,
  patch: MemberUpdateInput,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<MemberUpdateResult> {
  if (!id || !id.trim()) {
    return { ok: false, code: "validation", error: "Λείπει το αναγνωριστικό μέλους." };
  }

  const db = getDatabase(tenantId);
  const existing = db.prepare("SELECT id FROM members WHERE id = ?").get(id) as
    | { id: string }
    | undefined;
  if (!existing) {
    return { ok: false, code: "not_found", error: "Το μέλος δεν βρέθηκε." };
  }

  const sets: string[] = [];
  const values: Array<string | number> = [];
  let pinRotated = false;

  if (patch.fullName !== undefined) {
    const fullName = typeof patch.fullName === "string" ? patch.fullName.trim() : "";
    if (fullName.length < 2 || fullName.length > 80) {
      return {
        ok: false,
        code: "validation",
        error: "Το ονοματεπώνυμο πρέπει να έχει 2-80 χαρακτήρες.",
      };
    }
    sets.push("full_name = ?");
    values.push(fullName);
  }

  if (patch.email !== undefined) {
    const email = typeof patch.email === "string" ? patch.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email) || email.length > 160) {
      return { ok: false, code: "validation", error: "Μη έγκυρη διεύθυνση email." };
    }
    sets.push("email = ?");
    values.push(email);
  }

  if (patch.tierName !== undefined) {
    const tierName = typeof patch.tierName === "string" ? patch.tierName.trim() : "";
    if (!tierName || tierName.length > 80) {
      return { ok: false, code: "validation", error: "Μη έγκυρο όνομα πακέτου." };
    }
    sets.push("tier_name = ?");
    values.push(tierName);
  }

  if (patch.hasAIAccess !== undefined) {
    if (typeof patch.hasAIAccess !== "boolean") {
      return { ok: false, code: "validation", error: "Μη έγκυρη ρύθμιση ψηφιακού βοηθού." };
    }
    sets.push("has_ai_access = ?");
    values.push(patch.hasAIAccess ? 1 : 0);
  }

  if (patch.subscriptionStatus !== undefined) {
    if (patch.subscriptionStatus !== "active" && patch.subscriptionStatus !== "expired") {
      return { ok: false, code: "validation", error: "Μη έγκυρη κατάσταση συνδρομής." };
    }
    sets.push("subscription_status = ?");
    values.push(patch.subscriptionStatus);
  }

  if (patch.expiresAt !== undefined) {
    const expiresAt = typeof patch.expiresAt === "string" ? patch.expiresAt.trim() : "";
    if (!isValidIsoDate(expiresAt)) {
      return {
        ok: false,
        code: "validation",
        error: "Μη έγκυρη ημερομηνία λήξης (YYYY-MM-DD).",
      };
    }
    sets.push("expires_at = ?");
    values.push(expiresAt);
  }

  if (patch.pinCode !== undefined) {
    const pinCode = typeof patch.pinCode === "string" ? patch.pinCode.trim() : "";
    if (!PIN_RE.test(pinCode)) {
      return { ok: false, code: "validation", error: "Το PIN πρέπει να αποτελείται από 4-6 ψηφία." };
    }
    sets.push("pin_code = ?");
    values.push(await hashPin(pinCode));
    pinRotated = true;
  }

  if (sets.length === 0) {
    return { ok: false, code: "validation", error: "Δεν δόθηκαν πεδία προς ενημέρωση." };
  }

  try {
    db.prepare(`UPDATE members SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed/i.test(message)) {
      return {
        ok: false,
        code: "conflict",
        error: "Υπάρχει ήδη μέλος με αυτό το email.",
      };
    }
    throw err;
  }

  if (pinRotated) {
    revokeAllMemberSessions(id, Date.now(), tenantId);
  }

  const updated = db
    .prepare(
      "SELECT id, member_code, full_name, email, tier_name, has_ai_access, subscription_status, expires_at, created_at FROM members WHERE id = ?"
    )
    .get(id) as unknown as DbAdminMember | undefined;

  if (!updated) {
    return { ok: false, code: "not_found", error: "Το μέλος δεν βρέθηκε." };
  }

  return { ok: true, member: updated, pinRotated };
}

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
