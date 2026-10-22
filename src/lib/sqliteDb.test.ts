import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GeneratedWorkoutPlan } from "@/types";

// Isolate every test run in its own throwaway data directory
const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-test-"));
process.env.SQLITE_DATA_DIR = tempDir;

import {
  getDatabase,
  getMemberByCredentials,
  saveWorkoutPlanToDb,
  getAllMembersAdmin,
  upsertMemberAdmin,
  deleteMemberAdmin,
  saveLeadInquiryToDb,
  getAllLeadsAdmin,
  updateLeadStatusAdmin,
  getSavedGymConfig,
  updateSavedGymConfig,
  exportMemberData,
  deleteLeadAdmin,
  purgeExpiredLeads,
  deleteLeadsByEmail,
  eraseMemberCompletely,
} from "./sqliteDb";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const memberCreds = { identifier: "NX-8492", pin: "1234" };

const samplePlan = (id: string): GeneratedWorkoutPlan =>
  ({
    id,
    createdAt: new Date().toISOString(),
    userGoal: "hypertrophy",
    experienceLevel: "intermediate",
    daysPerWeek: 3,
    sessionDuration: 60,
    splitType: "full_body",
    splitName: "Test Split",
    coachAdvice: "Test advice",
    warmupProtocol: [],
    weeklyCardioRecommendation: "",
    days: [],
  }) as GeneratedWorkoutPlan;

describe("sqliteDb", () => {
  it("boots the schema and seeds demo members", () => {
    const db = getDatabase();
    const row = db.prepare("SELECT COUNT(*) as count FROM members").get() as { count: number };
    expect(row.count).toBeGreaterThanOrEqual(2);
  });

  it("authenticates a seeded demo member with its PIN", () => {
    const member = getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member?.memberCode).toBe("NX-8492");
    expect(member?.subscription.hasAIAccess).toBe(true);
  });

  it("rejects an invalid PIN", () => {
    expect(getMemberByCredentials("NX-8492", "0000")).toBeNull();
    expect(getMemberByCredentials("unknown@example.com", "1234")).toBeNull();
  });

  it("persists a workout plan and returns it on the next login", () => {
    const member = getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member).not.toBeNull();

    const planId = `plan-test-${Date.now()}`;
    expect(saveWorkoutPlanToDb(member!.id, samplePlan(planId))).toBe(true);

    const refreshed = getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(refreshed?.savedPlans.some((p) => p.id === planId)).toBe(true);
  });

  it("rejects invalid plan payloads", () => {
    const member = getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(saveWorkoutPlanToDb(member!.id, { ...samplePlan(""), splitName: "" } as GeneratedWorkoutPlan)).toBe(false);
  });

  it("lists members without exposing pin hashes", () => {
    const rows = getAllMembersAdmin();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect((row as Record<string, unknown>).pin_code).toBeUndefined();
    }
  });

  it("upserts a new member (loginable) and deletes it again", () => {
    const code = `NX-T${Date.now()}`;
    const email = `test-${Date.now()}@example.com`;
    expect(
      upsertMemberAdmin({
        memberCode: code,
        fullName: "Test Member",
        email,
        pinCode: "4321",
        tierName: "Standard Gym Access",
        hasAIAccess: false,
        subscriptionStatus: "active",
        expiresAt: "2027-01-01",
      })
    ).toBe(true);

    const created = getAllMembersAdmin().find((m) => m.member_code === code);
    expect(created?.full_name).toBe("Test Member");
    expect(getMemberByCredentials(code, "4321")).not.toBeNull();

    expect(deleteMemberAdmin(created!.id)).toBe(true);
    expect(getAllMembersAdmin().some((m) => m.member_code === code)).toBe(false);
  });

  it("rejects invalid member payloads", () => {
    expect(
      upsertMemberAdmin({
        memberCode: "NX-BAD",
        fullName: "X",
        email: "not-an-email",
        pinCode: "12",
        tierName: "Standard",
        hasAIAccess: false,
        subscriptionStatus: "active",
        expiresAt: "2027-01-01",
      })
    ).toBe(false);
  });

  it("stores a lead and updates its status", () => {
    const email = `lead-${Date.now()}@example.com`;
    expect(saveLeadInquiryToDb({ fullName: "Jane Doe", email })).toBe(true);

    const leads = getAllLeadsAdmin();
    const created = leads.find((l) => l.email === email);
    expect(created).toBeDefined();

    expect(updateLeadStatusAdmin(created!.id, "contacted")).toBe(true);
    expect(getAllLeadsAdmin().find((l) => l.id === created!.id)?.status).toBe("contacted");
  });

  it("validates lead payloads", () => {
    expect(saveLeadInquiryToDb({ fullName: "J", email: "bad" })).toBe(false);
  });

  it("returns the seeded gym config and persists updates", () => {
    const initial = getSavedGymConfig();
    expect(initial.gymName).toBe("NEXUS ATHLETICS");

    expect(updateSavedGymConfig({ gymName: "NEXUS TEST GYM" })).toBe(true);
    expect(getSavedGymConfig().gymName).toBe("NEXUS TEST GYM");

    updateSavedGymConfig({ gymName: initial.gymName });
    expect(getSavedGymConfig().gymName).toBe(initial.gymName);
  });

  it("exports a member's data without exposing the pin hash", () => {
    const member = getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member).not.toBeNull();

    const exported = exportMemberData(member!.id);
    expect(exported.member?.member_code).toBe("NX-8492");
    expect((exported.member as Record<string, unknown> | null)?.pin_code).toBeUndefined();
    expect(Array.isArray(exported.plans)).toBe(true);
  });

  it("returns an empty export for an unknown member", () => {
    const exported = exportMemberData("mem-does-not-exist");
    expect(exported.member).toBeNull();
    expect(exported.plans).toEqual([]);
  });

  it("deletes a lead inquiry", () => {
    const email = `del-${Date.now()}@example.com`;
    expect(saveLeadInquiryToDb({ fullName: "Delete Me", email })).toBe(true);

    const created = getAllLeadsAdmin().find((l) => l.email === email);
    expect(created).toBeDefined();

    expect(deleteLeadAdmin(created!.id)).toBe(true);
    expect(getAllLeadsAdmin().some((l) => l.id === created!.id)).toBe(false);
  });

  it("purges only leads older than the retention window", () => {
    const db = getDatabase();
    const now = new Date();
    const old = new Date();
    old.setMonth(old.getMonth() - 24);

    db.prepare(
      "INSERT INTO lead_inquiries (id, full_name, email, status, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("lead-old-test", "Old Lead", "old@example.com", "pending", old.toISOString());
    db.prepare(
      "INSERT INTO lead_inquiries (id, full_name, email, status, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("lead-new-test", "New Lead", "new@example.com", "pending", now.toISOString());

    expect(purgeExpiredLeads(12)).toBeGreaterThanOrEqual(1);

    const ids = getAllLeadsAdmin().map((l) => l.id);
    expect(ids).not.toContain("lead-old-test");
    expect(ids).toContain("lead-new-test");
  });

  it("deletes leads by email, case-insensitively", () => {
    const email = `CaseUser-${Date.now()}@Example.com`;
    expect(saveLeadInquiryToDb({ fullName: "Case User", email })).toBe(true);

    expect(deleteLeadsByEmail(email.toLowerCase())).toBeGreaterThanOrEqual(1);
    expect(getAllLeadsAdmin().some((l) => l.email.toLowerCase() === email.toLowerCase())).toBe(false);
    // Deleting an address with no leads is a no-op, not an error.
    expect(deleteLeadsByEmail("nobody@example.com")).toBe(0);
  });

  it("erases a member together with their plans and lead inquiries", () => {
    const code = `NX-ERA-${Date.now()}`;
    const email = `erase-${Date.now()}@example.com`;

    expect(
      upsertMemberAdmin({
        memberCode: code,
        fullName: "Erase Test",
        email,
        pinCode: "4321",
        tierName: "Standard",
        hasAIAccess: false,
        subscriptionStatus: "active",
        expiresAt: "2027-01-01",
      })
    ).toBe(true);
    const member = getAllMembersAdmin().find((m) => m.member_code === code)!;

    expect(saveWorkoutPlanToDb(member.id, samplePlan(`erase-plan-${Date.now()}`))).toBe(true);
    expect(saveLeadInquiryToDb({ fullName: "Erase Test", email })).toBe(true);

    expect(eraseMemberCompletely(member.id)).toBe(true);

    // Member, plans (cascade) and the matching lead are all gone.
    expect(getAllMembersAdmin().some((m) => m.id === member.id)).toBe(false);
    expect(getAllLeadsAdmin().some((l) => l.email === email)).toBe(false);
    const remaining = getDatabase()
      .prepare("SELECT COUNT(*) as c FROM workout_plans WHERE member_id = ?")
      .get(member.id) as { c: number };
    expect(remaining.c).toBe(0);

    // Erasing an unknown member reports failure rather than throwing.
    expect(eraseMemberCompletely("mem-does-not-exist")).toBe(false);
  });
});
