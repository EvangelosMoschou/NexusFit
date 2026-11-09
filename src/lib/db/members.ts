import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { DbAdminMember, DbMember, DbWorkoutPlan, MemberAccess } from "./types";
import type { GeneratedWorkoutPlan } from "@/types";
import { hashPin, verifyPin } from "@/lib/passwordHash";
import { revokeAllMemberSessions } from "./memberSessions";

// Member records, workout plans and the GDPR access/erasure paths.

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
