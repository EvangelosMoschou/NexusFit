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

export async function logoutMember(all = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  clearMemberSession();

  // The session cookie is HttpOnly, so it can only be cleared server-side. The
  // server also revokes the session row (and all rows when `all` is true).
  // Retry once because a transient network failure leaves the server session
  // valid until its idle/absolute timeout.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all }),
        keepalive: true,
      });
      if (res.ok || res.status === 401) return true;
    } catch {
      // Retry once below.
    }

    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  console.warn("[auth] logout request failed; the server session will expire at its timeout.");
  return false;
}

export function addPlanToMemberHistory(plan: GeneratedWorkoutPlan): MemberUser | null {
  const member = getCurrentMember();
  if (!member) return null;

  // A profile written by an older build (or edited by hand) may not carry
  // savedPlans; treat that as an empty history instead of crashing the caller.
  const savedPlans = Array.isArray(member.savedPlans) ? member.savedPlans : [];
  const updatedPlans = [plan, ...savedPlans.filter((p) => p.id !== plan.id)];
  const updatedMember: MemberUser = { ...member, savedPlans: updatedPlans };

  // Persisting is best effort: a full quota or Safari private mode throws, and
  // that must not stop the plan from reaching the caller (which keeps the UI
  // working for this session).
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedMember));
    } catch {
      // Not persisted; the in-memory copy returned below is still correct.
    }
  }
  return updatedMember;
}
