import { defaultGymConfig } from "@/config/gymConfig";
import { GeneratedWorkoutPlan, GymConfig } from "@/types";
import { MemberUser } from "@/lib/auth";

// Demo API: every fetch to /api/* is answered in the browser. Nothing leaves
// the page and nothing is persisted outside localStorage.

const PLANS_KEY_PREFIX = "nexusfit_demo_plans_";
let currentMemberCode: string | null = null;

const demoExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

const aiSubscription = {
  tier: "all_inclusive_ai" as const,
  tierName: "Ευεξία & Ψηφιακός Βοηθός (59€/μήνα)",
  status: "active" as const,
  expiresAt: demoExpiry,
  autoRenew: true,
  hasAIAccess: true,
};

const standardSubscription = {
  tier: "standard" as const,
  tierName: "Συνδρομή Ευεξίας (45€/μήνα)",
  status: "active" as const,
  expiresAt: demoExpiry,
  autoRenew: true,
  hasAIAccess: false,
};

const demoMembers: MemberUser[] = [
  {
    id: "mem-8492",
    memberCode: "NX-8492",
    fullName: "Γεώργιος Παπαδόπουλος",
    email: "george@nexusathletics.gr",
    joinedAt: "2026-01-15",
    subscription: aiSubscription,
    savedPlans: [],
  },
  {
    id: "mem-3109",
    memberCode: "NX-3109",
    fullName: "Μαρία Κωνσταντίνου",
    email: "maria@nexusathletics.gr",
    joinedAt: "2025-11-03",
    subscription: standardSubscription,
    savedPlans: [],
  },
];

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function readPlans(memberCode: string): GeneratedWorkoutPlan[] {
  try {
    const raw = localStorage.getItem(`${PLANS_KEY_PREFIX}${memberCode}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePlans(memberCode: string, plans: GeneratedWorkoutPlan[]): void {
  try {
    localStorage.setItem(`${PLANS_KEY_PREFIX}${memberCode}`, JSON.stringify(plans));
  } catch {}
}

function withPlans(member: MemberUser): MemberUser {
  return { ...member, savedPlans: readPlans(member.memberCode) };
}

function findMember(identifier: string): MemberUser | undefined {
  const clean = identifier.trim().toLowerCase();
  return demoMembers.find(
    (m) => m.memberCode.toLowerCase() === clean || m.email.toLowerCase() === clean
  );
}

function parseBody(init: RequestInit | undefined, request: Request | null): any {
  if (init?.body && typeof init.body === "string") {
    try {
      return JSON.parse(init.body);
    } catch {
      return {};
    }
  }
  return {};
}

export function installMockApi(): void {
  if (typeof window === "undefined") return;
  const browserWindow = window as unknown as { __nexusfitMockInstalled?: boolean; fetch: typeof fetch };
  if (browserWindow.__nexusfitMockInstalled) return;
  browserWindow.__nexusfitMockInstalled = true;

  const originalFetch = window.fetch
    ? window.fetch.bind(window)
    : globalThis.fetch.bind(globalThis);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const rawUrl = request ? request.url : String(input);
    const url = new URL(rawUrl, window.location.origin);

    if (!url.pathname.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const body = parseBody(init, request);
    const config: GymConfig = defaultGymConfig;

    // Public config
    if (url.pathname === "/api/config" && method === "GET") {
      return json({ success: true, config });
    }

    // Member login (demo credentials: NX-8492 or NX-3109, PIN 1234)
    if (url.pathname === "/api/auth/member" && method === "POST") {
      const member = findMember(String(body.identifier ?? ""));
      if (!member || String(body.pin ?? "").trim() !== "1234") {
        return json({ success: false, error: "Λανθασμένος κωδικός μέλους ή PIN." }, 401);
      }
      currentMemberCode = member.memberCode;
      return json({ success: true, member: withPlans(member) });
    }

    // Logout
    if (url.pathname === "/api/auth/logout" && method === "POST") {
      currentMemberCode = null;
      return json({ success: true });
    }

    // Lead form
    if (url.pathname === "/api/leads" && method === "POST") {
      return json({ success: true });
    }

    // Plan persistence (mirrors the server-side history)
    if (url.pathname === "/api/member/workouts" && method === "POST") {
      const plan = body.plan as GeneratedWorkoutPlan | undefined;
      if (plan && currentMemberCode) {
        const plans = [plan, ...readPlans(currentMemberCode).filter((p) => p.id !== plan.id)];
        writePlans(currentMemberCode, plans);
      }
      return json({ success: true });
    }

    // GDPR export
    if (url.pathname === "/api/member/export" && method === "GET") {
      const member = demoMembers.find((m) => m.memberCode === currentMemberCode);
      const payload = {
        exportedAt: new Date().toISOString(),
        note: "Demo export generated in the browser.",
        member: member ? withPlans(member) : null,
      };
      return json(payload, 200, {
        "Content-Disposition": 'attachment; filename="nexusfit-member-export.json"',
      });
    }

    // GDPR erasure
    if (url.pathname === "/api/member/erase" && method === "DELETE") {
      if (currentMemberCode) {
        localStorage.removeItem(`${PLANS_KEY_PREFIX}${currentMemberCode}`);
      }
      currentMemberCode = null;
      return json({ success: true });
    }

    return json({ success: false, error: "Not found" }, 404);
  }) as typeof window.fetch;
}
