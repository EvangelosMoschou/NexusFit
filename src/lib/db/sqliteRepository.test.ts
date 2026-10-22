import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GeneratedWorkoutPlan } from "@/types";

// Own throwaway data directory, mirroring the sqliteDb test isolation.
const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-repo-"));
process.env.SQLITE_DATA_DIR = tempDir;

import { getRepository } from "./index";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const samplePlan = (id: string): GeneratedWorkoutPlan => ({
  id,
  createdAt: new Date().toISOString(),
  userGoal: "hypertrophy",
  experienceLevel: "intermediate",
  daysPerWeek: 3,
  sessionDuration: 60,
  splitType: "full_body",
  splitName: "Repo Test Split",
  coachAdvice: "Test advice",
  warmupProtocol: [],
  weeklyCardioRecommendation: "",
  days: [],
});

describe("repository boundary", () => {
  it("reads the gym config through the async interface", async () => {
    const config = await getRepository().getGymConfig();
    expect(config.gymName).toBe("NEXUS ATHLETICS");
    expect(Array.isArray(config.legal.privacy)).toBe(true);
  });

  it("authenticates a member asynchronously", async () => {
    expect((await getRepository().authenticateMember("NX-8492", "1234"))?.memberCode).toBe("NX-8492");
    expect(await getRepository().authenticateMember("NX-8492", "9999")).toBeNull();
  });

  it("persists a workout plan for an authenticated member", async () => {
    const member = await getRepository().authenticateMember("NX-8492", "1234");
    expect(member).not.toBeNull();

    const planId = `repo-plan-${Date.now()}`;
    expect(await getRepository().saveWorkoutPlan(member!.id, samplePlan(planId))).toBe(true);
  });

  it("lists members without exposing pin hashes", async () => {
    const members = await getRepository().listMembers();
    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      expect((member as Record<string, unknown>).pin_code).toBeUndefined();
    }
  });

  it("supports the full lead lifecycle", async () => {
    const email = `repo-lead-${Date.now()}@example.com`;
    expect(await getRepository().saveLead({ fullName: "Repo Lead", email })).toBe(true);

    const lead = (await getRepository().listLeads()).find((l) => l.email === email);
    expect(lead).toBeDefined();

    expect(await getRepository().updateLeadStatus(lead!.id, "contacted")).toBe(true);
    expect(await getRepository().deleteLead(lead!.id)).toBe(true);
    expect((await getRepository().listLeads()).some((l) => l.id === lead!.id)).toBe(false);
  });

  it("exports member data without the pin hash", async () => {
    const member = await getRepository().authenticateMember("NX-8492", "1234");
    const exported = await getRepository().exportMember(member!.id);

    expect(exported.member?.member_code).toBe("NX-8492");
    expect((exported.member as Record<string, unknown> | null)?.pin_code).toBeUndefined();
  });
});
