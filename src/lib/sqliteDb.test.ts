import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GeneratedWorkoutPlan } from "@/types";
import { defaultGymConfig } from "@/config/gymConfig";

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
  listMediaAdmin,
  getMediaWithData,
  saveMediaToDb,
  deleteMediaAdmin,
  checkInMember,
  checkOutMember,
  getMemberVisitStatus,
  getReentryCooldownSeconds,
  getMemberVisits,
  getMemberVisitCount,
  getInsideMembers,
  getOccupancy,
  getMemberAccess,
  createMemberSession,
  getMemberSession,
  touchMemberSession,
  revokeMemberSession,
  revokeAllMemberSessions,
  listMemberSessions,
  enforceMemberSessionLimit,
  purgeMemberSessions,
  touchMemberVisit,
  closeIdleVisits,
  listStaffAccounts,
  getStaffAccountById,
  getStaffAccountByEmail,
  createStaffAccount,
  updateStaffAccount,
  deleteStaffAccount,
  touchStaffLogin,
  insertAuditEntry,
  listAuditEntries,
  anonymizeStaffAudit,
  purgeAuditLog,
  ensureMemberNotification,
  listMemberNotifications,
  getUnreadNotificationCount,
  markMemberNotificationRead,
  markAllMemberNotificationsRead,
  recordAccessEvent,
  countAccessEvents,
  listAccessAlerts,
  listRecentAccessEvents,
  purgeAccessEvents,
} from "./sqliteDb";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
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

  it("authenticates a seeded demo member with its PIN", async () => {
    const member = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member?.memberCode).toBe("NX-8492");
    expect(member?.subscription.hasAIAccess).toBe(true);
  });

  it("rejects an invalid PIN", async () => {
    expect(await getMemberByCredentials("NX-8492", "0000")).toBeNull();
    expect(await getMemberByCredentials("unknown@example.com", "1234")).toBeNull();
  });

  it("persists a workout plan and returns it on the next login", async () => {
    const member = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member).not.toBeNull();

    const planId = `plan-test-${Date.now()}`;
    expect(saveWorkoutPlanToDb(member!.id, samplePlan(planId))).toBe(true);

    const refreshed = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(refreshed?.savedPlans.some((p) => p.id === planId)).toBe(true);
  });

  it("rejects invalid plan payloads", async () => {
    const member = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(
      saveWorkoutPlanToDb(member!.id, { ...samplePlan(""), splitName: "" } as GeneratedWorkoutPlan)
    ).toBe(false);
  });

  it("lists members without exposing pin hashes", () => {
    const rows = getAllMembersAdmin();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect((row as Record<string, unknown>).pin_code).toBeUndefined();
    }
  });

  it("upserts a new member (loginable) and deletes it again", async () => {
    const code = `NX-T${Date.now()}`;
    const email = `test-${Date.now()}@example.com`;
    expect(
      await upsertMemberAdmin({
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
    expect(await getMemberByCredentials(code, "4321")).not.toBeNull();

    expect(deleteMemberAdmin(created!.id)).toBe(true);
    expect(getAllMembersAdmin().some((m) => m.member_code === code)).toBe(false);
  });

  it("rejects invalid member payloads", async () => {
    expect(
      await upsertMemberAdmin({
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

  it("exports a member's data without exposing the pin hash", async () => {
    const member = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
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
    expect(getAllLeadsAdmin().some((l) => l.email.toLowerCase() === email.toLowerCase())).toBe(
      false
    );
    // Deleting an address with no leads is a no-op, not an error.
    expect(deleteLeadsByEmail("nobody@example.com")).toBe(0);
  });

  it("erases a member together with their plans and lead inquiries", async () => {
    const code = `NX-ERA-${Date.now()}`;
    const email = `erase-${Date.now()}@example.com`;

    expect(
      await upsertMemberAdmin({
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

  it("tracks check-in, occupancy and check-out", async () => {
    const member = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member).not.toBeNull();

    expect(getMemberAccess(member!.id)?.subscription_status).toBe("active");

    const first = checkInMember(member!.id);
    expect(first.status).toBe("in");
    expect(first.visit?.last_activity_at).toBeTruthy();
    expect(getMemberVisitStatus(member!.id).inside).toBe(true);

    const second = checkInMember(member!.id);
    expect(second.status).toBe("already_in");

    expect(touchMemberVisit(member!.id)).toBe(true);
    expect(getOccupancy().inside).toBeGreaterThanOrEqual(1);
    expect(getInsideMembers().some((entry) => entry.member_id === member!.id)).toBe(true);
    expect(getMemberVisitCount(member!.id)).toBeGreaterThanOrEqual(1);

    const out = checkOutMember(member!.id);
    expect(out.status).toBe("out");
    expect(getMemberVisitStatus(member!.id).inside).toBe(false);
    expect(getMemberVisits(member!.id).length).toBeGreaterThanOrEqual(1);
    expect(checkOutMember(member!.id).status).toBe("not_in");

    expect(getReentryCooldownSeconds(member!.id)).toBe(0);
  });

  it("closes visits that cross the idle activity window", async () => {
    const member = await getMemberByCredentials("NX-3109", "1234");
    expect(member).not.toBeNull();

    expect(checkInMember(member!.id).status).toBe("in");
    expect(getMemberVisitStatus(member!.id).inside).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 61 * 60 * 1000));

    expect(closeIdleVisits(60)).toBeGreaterThanOrEqual(1);
    expect(getMemberVisitStatus(member!.id).inside).toBe(false);

    vi.useRealTimers();
    checkOutMember(member!.id);
  });

  it("creates, updates and deletes staff accounts", async () => {
    const email = "staff-test@example.com";
    const created = await createStaffAccount({
      name: "Staff Test",
      email,
      role: "trainer",
      password: "password123",
      permissions: ["members_view", "occupancy_view", "occupancy_manage"],
    });

    expect(created).not.toBeNull();
    expect(created).not.toHaveProperty("password_hash");
    expect(created?.role).toBe("trainer");
    expect(created?.active).toBe(true);

    const stored = getStaffAccountByEmail(email.toUpperCase());
    expect(stored).not.toBeNull();
    expect(stored?.password_hash.startsWith("scrypt:")).toBe(true);

    touchStaffLogin(stored!.id);
    expect(getStaffAccountById(stored!.id)?.last_login_at).toBeTruthy();

    const updated = await updateStaffAccount(stored!.id, {
      permissions: ["members_view"],
      active: false,
    });
    expect(updated?.active).toBe(false);
    expect(updated?.permissions).toEqual(["members_view"]);

    const duplicate = await createStaffAccount({
      name: "Duplicate",
      email,
      role: "trainer",
      password: "password123",
    });
    expect(duplicate).toBeNull();

    expect(deleteStaffAccount(created!.id)).toBe(true);
    expect(getStaffAccountById(created!.id)).toBeNull();
    expect(listStaffAccounts().some((account) => account.id === created!.id)).toBe(false);
  });

  it("tracks repeated access events and raises an alert above the weekly threshold", async () => {
    const member = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member).not.toBeNull();
    const memberId = member!.id;

    expect(recordAccessEvent(memberId, "duplicate_entry", { direction: "in" })).toBe(true);
    expect(recordAccessEvent(memberId, "quick_reentry", { direction: "in" })).toBe(true);
    expect(countAccessEvents(memberId, 7)).toBe(2);

    const alerts = listAccessAlerts(1, 7);
    const alert = alerts.find((item) => item.member_id === memberId);
    expect(alert).toBeDefined();
    expect(alert?.event_count).toBe(2);
    expect(alert?.event_types).toEqual(
      expect.arrayContaining(["duplicate_entry", "quick_reentry"])
    );

    const recent = listRecentAccessEvents(10);
    expect(recent.some((item) => item.member_id === memberId)).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 366 * 24 * 60 * 60 * 1000));
    expect(purgeAccessEvents(365)).toBeGreaterThanOrEqual(2);
    expect(countAccessEvents(memberId, 7)).toBe(0);
    vi.useRealTimers();
  });

  it("creates deduplicated member notifications and tracks read state", async () => {
    const member = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member).not.toBeNull();
    const memberId = member!.id;

    const input = {
      type: "announcement",
      title: "Test notice",
      body: "Test body",
      dedupeKey: "test-notification:1",
    };

    expect(ensureMemberNotification(memberId, input)).toBe(true);
    expect(ensureMemberNotification(memberId, input)).toBe(false);
    expect(getUnreadNotificationCount(memberId)).toBe(1);

    const notifications = listMemberNotifications(memberId);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("Test notice");
    expect(notifications[0].read_at).toBeNull();

    expect(markMemberNotificationRead(memberId, notifications[0].id)).toBe(true);
    expect(getUnreadNotificationCount(memberId)).toBe(0);

    expect(
      ensureMemberNotification(memberId, {
        type: "schedule",
        title: "Schedule",
        body: "Changed",
        dedupeKey: "test-notification:2",
      })
    ).toBe(true);
    expect(markAllMemberNotificationsRead(memberId)).toBe(1);
    expect(getUnreadNotificationCount(memberId)).toBe(0);
  });

  it("stores, filters, anonymizes and purges audit entries", () => {
    expect(
      insertAuditEntry({
        actorId: "staff-audit-a",
        actorName: "Audit Actor",
        actorEmail: "audit@example.com",
        actorRole: "admin",
        actorLegacy: false,
        action: "member.save",
        entityType: "member",
        entityId: "mem-audit",
        details: { hasAIAccess: true },
        ip: "203.0.113.10",
      })
    ).toBe(true);
    expect(
      insertAuditEntry({
        actorId: "staff-audit-b",
        actorName: "Second Actor",
        actorRole: "trainer",
        action: "config.update",
        entityType: "config",
        details: { fields: ["announcements"] },
      })
    ).toBe(true);

    const all = listAuditEntries({ limit: 10 });
    expect(all.total).toBeGreaterThanOrEqual(2);

    const filtered = listAuditEntries({ action: "member.save" });
    expect(filtered.total).toBe(1);
    expect(filtered.entries[0].details.hasAIAccess).toBe(true);
    expect(filtered.entries[0].actor_email).toBe("audit@example.com");
    expect(filtered.entries[0].ip).toBe("203.0.113.10");

    expect(anonymizeStaffAudit("staff-audit-a")).toBeGreaterThanOrEqual(1);
    const afterAnonymize = listAuditEntries({ action: "member.save" });
    expect(afterAnonymize.entries[0].actor_id).toBeNull();
    expect(afterAnonymize.entries[0].actor_name).toBe("Διαγραμμένος λογαριασμός");
    expect(afterAnonymize.entries[0].actor_email).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 366 * 24 * 60 * 60 * 1000));
    expect(purgeAuditLog(365)).toBeGreaterThanOrEqual(2);
    expect(listAuditEntries({ limit: 10 }).total).toBe(0);
    vi.useRealTimers();
  });

  it("merges mandatory legal disclosures into an older saved config", () => {
    try {
      updateSavedGymConfig({
        legal: {
          tos: [{ title: "1. Γενικοί Όροι", body: "custom tos" }],
          privacy: [
            { title: "1. Υπεύθυνος Επεξεργασίας", body: "custom owner" },
            { title: "5. Διατήρηση Δεδομένων", body: "OLD RETENTION" },
            { title: "10. Custom", body: "keep me" },
          ],
        },
      });

      const config = getSavedGymConfig();
      const privacy = config.legal.privacy;
      expect(privacy.find((section) => section.title === "5. Διατήρηση Δεδομένων")?.body).toContain(
        "self-service"
      );
      expect(privacy.some((section) => section.title === "8. Λογαριασμοί Προσωπικού")).toBe(true);
      expect(privacy.some((section) => section.title === "10. Custom")).toBe(true);
      expect(privacy.some((section) => section.title === "10. Αρχείο Ενεργειών")).toBe(true);
      expect(privacy.find((section) => section.title === "1. Υπεύθυνος Επεξεργασίας")?.body).toBe(
        "custom owner"
      );
      expect(config.legal.tos.find((section) => section.title === "1. Γενικοί Όροι")?.body).toBe(
        "custom tos"
      );
    } finally {
      updateSavedGymConfig({ legal: defaultGymConfig.legal });
    }
  });

  it("migrates the old template address and hides stale coordinates for custom addresses", () => {
    try {
      updateSavedGymConfig({
        address: "Λεωφόρος Βουλιαγμένης 128, Γλυφάδα",
        city: "Αθήνα",
        phone: undefined,
        latitude: undefined,
        longitude: undefined,
      });

      const migrated = getSavedGymConfig();
      expect(migrated.address).toBe(defaultGymConfig.address);
      expect(migrated.city).toBe(defaultGymConfig.city);
      expect(migrated.latitude).toBe(defaultGymConfig.latitude);
      expect(migrated.longitude).toBe(defaultGymConfig.longitude);

      updateSavedGymConfig({
        address: "Οδός Παραδείγματος 10",
        city: "Πάτρα",
        latitude: undefined,
        longitude: undefined,
      });

      const custom = getSavedGymConfig();
      expect(custom.address).toBe("Οδός Παραδείγματος 10");
      expect(custom.latitude).toBeUndefined();
      expect(custom.longitude).toBeUndefined();
    } finally {
      updateSavedGymConfig({
        address: defaultGymConfig.address,
        city: defaultGymConfig.city,
        phone: defaultGymConfig.phone,
        latitude: defaultGymConfig.latitude,
        longitude: defaultGymConfig.longitude,
      });
    }
  });

  it("stores, serves and deletes gallery media", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const saved = saveMediaToDb({
      filename: "test.png",
      mime: "image/png",
      size: bytes.length,
      alt: "Δοκιμαστική φωτογραφία",
      data: bytes,
    });

    expect(saved).not.toBeNull();
    expect(listMediaAdmin().some((item) => item.id === saved!.id)).toBe(true);

    const fetched = getMediaWithData(saved!.id);
    expect(fetched?.mime).toBe("image/png");
    expect(Array.from(fetched!.data)).toEqual(Array.from(bytes));

    expect(deleteMediaAdmin(saved!.id)).toBe(true);
    expect(getMediaWithData(saved!.id)).toBeNull();
  });
});

describe("member sessions", () => {
  async function demoMember() {
    const member = await getMemberByCredentials(memberCreds.identifier, memberCreds.pin);
    expect(member).not.toBeNull();
    return member!;
  }

  function sessionInput(memberId: string, hash: string, now = Date.now()) {
    return {
      sessionIdHash: hash,
      memberId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + 60_000,
      ip: "127.0.0.1",
      userAgent: "vitest",
    };
  }

  it("stores the hash, touches activity and revokes one session", async () => {
    const member = await demoMember();
    const now = Date.now();
    const hash = `test-session-${now}`;

    expect(createMemberSession(sessionInput(member.id, hash, now))).toBe(true);
    expect(getMemberSession(hash)?.member_id).toBe(member.id);
    expect(getMemberSession(hash)?.ip).toBe("127.0.0.1");
    expect(getMemberSession("raw-session-id")).toBeNull();

    expect(touchMemberSession(hash, now + 1_000)).toBe(true);
    expect(touchMemberSession(hash, now + 2_000)).toBe(true);
    expect(listMemberSessions(member.id, now - 1_000, now + 3_000)).toHaveLength(1);

    expect(revokeMemberSession(hash, "another-member", now + 3_000)).toBe(false);
    expect(revokeMemberSession(hash, member.id, now + 3_000)).toBe(true);
    expect(listMemberSessions(member.id, now - 1_000, now + 4_000)).toHaveLength(0);
  });

  it("revokes all sessions, optionally keeping one", async () => {
    const member = await demoMember();
    const now = Date.now();
    const first = `test-session-a-${now}`;
    const second = `test-session-b-${now}`;

    expect(createMemberSession(sessionInput(member.id, first, now))).toBe(true);
    expect(createMemberSession(sessionInput(member.id, second, now))).toBe(true);

    expect(revokeAllMemberSessions(member.id, now + 1_000, undefined, first)).toBe(1);
    expect(getMemberSession(first)?.revoked_at).toBeNull();
    expect(getMemberSession(second)?.revoked_at).toBe(now + 1_000);

    expect(revokeAllMemberSessions(member.id, now + 2_000)).toBe(1);
    expect(getMemberSession(first)?.revoked_at).toBe(now + 2_000);
  });

  it("caps active sessions and revokes the oldest", async () => {
    const member = await demoMember();
    const now = Date.now();
    await revokeAllMemberSessions(member.id, now);
    const hashes = [1, 2, 3].map((index) => `test-session-cap-${now}-${index}`);

    for (const hash of hashes) {
      expect(createMemberSession(sessionInput(member.id, hash, now + hashes.indexOf(hash)))).toBe(
        true
      );
    }

    expect(enforceMemberSessionLimit(member.id, 2, now + 10)).toBe(1);
    expect(getMemberSession(hashes[0])?.revoked_at).toBe(now + 10);
    expect(getMemberSession(hashes[1])?.revoked_at).toBeNull();
    expect(getMemberSession(hashes[2])?.revoked_at).toBeNull();
  });

  it("revokes all sessions when an admin changes a member PIN", async () => {
    const now = Date.now();
    const code = `NX-PIN-${now}`;
    const email = `pin-change-${now}@example.com`;
    const base = {
      memberCode: code,
      fullName: "PIN Change Test",
      email,
      pinCode: "1234",
      tierName: "Standard",
      hasAIAccess: false,
      subscriptionStatus: "active",
      expiresAt: "2030-01-01",
    };

    expect(await upsertMemberAdmin(base)).toBe(true);
    const member = (await getMemberByCredentials(code, "1234"))!;
    const hash = `test-session-pin-${now}`;
    expect(createMemberSession(sessionInput(member.id, hash, now))).toBe(true);

    expect(await upsertMemberAdmin({ ...base, pinCode: "1234" })).toBe(true);
    expect(getMemberSession(hash)?.revoked_at).toBeNull();

    expect(await upsertMemberAdmin({ ...base, pinCode: "5678" })).toBe(true);
    expect(getMemberSession(hash)?.revoked_at).not.toBeNull();
  });

  it("purges expired sessions and cascades on member deletion", async () => {
    const member = await demoMember();
    const now = Date.now();
    const expired = `test-session-expired-${now}`;
    expect(
      createMemberSession({
        ...sessionInput(member.id, expired, now - 10_000),
        expiresAt: now - 1,
      })
    ).toBe(true);
    expect(purgeMemberSessions(now)).toBeGreaterThanOrEqual(1);
    expect(getMemberSession(expired)).toBeNull();

    const code = `NX-DEL-${now}`;
    expect(
      await upsertMemberAdmin({
        memberCode: code,
        fullName: "Delete Session Test",
        email: `delete-session-${now}@example.com`,
        pinCode: "1234",
        tierName: "Standard",
        hasAIAccess: false,
        subscriptionStatus: "active",
        expiresAt: "2030-01-01",
      })
    ).toBe(true);
    const created = (await getMemberByCredentials(code, "1234"))!;
    const cascadeHash = `test-session-cascade-${now}`;
    expect(createMemberSession(sessionInput(created.id, cascadeHash, now))).toBe(true);
    expect(deleteMemberAdmin(created.id)).toBe(true);
    expect(getMemberSession(cascadeHash)).toBeNull();
  });
});
