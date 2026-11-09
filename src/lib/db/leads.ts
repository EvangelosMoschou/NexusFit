import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { DbLeadInquiry } from "./types";

// Contact-form leads and their retention window.

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
