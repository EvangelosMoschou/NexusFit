import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratedWorkoutPlan } from "@/types";
import {
  addPlanToMemberHistory,
  clearMemberSession,
  getCurrentMember,
  storeMemberSession,
  type MemberUser,
} from "./auth";
import { installBrowserStorage } from "./testUtils/browserStorage";

let store: Map<string, string>;

beforeEach(() => {
  store = installBrowserStorage();
  store.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const samplePlan: GeneratedWorkoutPlan = {
  id: "plan-1",
  createdAt: "2026-01-01T00:00:00.000Z",
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
};

const member: MemberUser = {
  id: "mem-1",
  memberCode: "NX-8492",
  fullName: "Δοκιμαστικό Μέλος",
  email: "member@example.com",
  joinedAt: "2025-01-01T00:00:00.000Z",
  subscription: {
    tier: "all_inclusive_ai",
    tierName: "All Access",
    status: "active",
    expiresAt: "2999-12-31",
    autoRenew: true,
    hasAIAccess: true,
  },
  savedPlans: [],
};

describe("member session storage", () => {
  it("round-trips the signed-in member", () => {
    storeMemberSession(member);
    expect(getCurrentMember()?.id).toBe("mem-1");
  });

  it("returns null for corrupt stored JSON instead of throwing", () => {
    store.set("nexusfit_logged_member", "{not json");
    expect(getCurrentMember()).toBeNull();
  });

  it("clears the member session", () => {
    storeMemberSession(member);
    clearMemberSession();
    expect(getCurrentMember()).toBeNull();
  });
});

describe("addPlanToMemberHistory", () => {
  it("prepends the new plan and de-duplicates by id", () => {
    storeMemberSession(member);

    addPlanToMemberHistory(samplePlan);
    const updated = addPlanToMemberHistory({ ...samplePlan, id: "plan-2" });

    expect(updated?.savedPlans.map((plan) => plan.id)).toEqual(["plan-2", "plan-1"]);
    expect(getCurrentMember()?.savedPlans).toHaveLength(2);
  });

  it("does nothing when no member is signed in", () => {
    expect(addPlanToMemberHistory(samplePlan)).toBeNull();
  });

  // A full quota or Safari private mode makes setItem throw. The plan must still
  // reach the caller so the UI keeps working; the failure is only persistence.
  it("survives a storage write failure and still returns the updated member", () => {
    storeMemberSession(member);
    vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    const updated = addPlanToMemberHistory(samplePlan);

    expect(updated?.savedPlans.map((plan) => plan.id)).toEqual(["plan-1"]);
  });

  // A profile stored by an older build (or edited by hand) can lack savedPlans.
  it("survives a stored profile that has no savedPlans array", () => {
    const { savedPlans: _omitted, ...legacyMember } = member;
    store.set("nexusfit_logged_member", JSON.stringify(legacyMember));

    const updated = addPlanToMemberHistory(samplePlan);

    expect(updated?.savedPlans.map((plan) => plan.id)).toEqual(["plan-1"]);
  });
});
