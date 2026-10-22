import { GeneratedWorkoutPlan } from "@/types";

export interface MemberSubscription {
  tier: "standard" | "all_inclusive_ai";
  tierName: string;
  status: "active" | "expired" | "pending_payment";
  expiresAt: string;
  autoRenew: boolean;
  hasAIAccess: boolean;
}

export interface MemberUser {
  id: string;
  memberCode: string; // e.g. "NX-7842"
  fullName: string;
  email: string;
  joinedAt: string;
  subscription: MemberSubscription;
  savedPlans: GeneratedWorkoutPlan[];
}

const AUTH_STORAGE_KEY = "nexusfit_logged_member";

export function getCurrentMember(): MemberUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function storeMemberSession(member: MemberUser): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(member));
  } catch {}
}

export function clearMemberSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {}
}

export async function logoutMember(): Promise<void> {
  if (typeof window === "undefined") return;
  clearMemberSession();
  // The session cookie is HttpOnly, so it can only be cleared server-side.
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
}

export function addPlanToMemberHistory(plan: GeneratedWorkoutPlan): MemberUser | null {
  const member = getCurrentMember();
  if (!member) return null;

  const updatedPlans = [plan, ...member.savedPlans.filter((p) => p.id !== plan.id)];
  const updatedMember: MemberUser = { ...member, savedPlans: updatedPlans };

  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedMember));
  }
  return updatedMember;
}
