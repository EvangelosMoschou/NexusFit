import { beforeAll, describe, expect, it, vi } from "vitest";
import { installMockApi } from "../../site/src/mockApi";

// The demo's mock API runs against browser globals; provide minimal stubs.
const store = new Map<string, string>();

beforeAll(() => {
  Object.assign(globalThis, {
    window: {
      location: { origin: "http://localhost" },
      fetch: vi.fn(),
    },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
  installMockApi();
});

const api = (path: string, init?: RequestInit) => window.fetch(path, init);

const post = (path: string, body: unknown) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("demo mock API", () => {
  it("serves the public gym config", async () => {
    const res = await api("/api/config");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.config.gymName).toBe("NEXUS ATHLETICS");
  });

  it("rejects a wrong PIN", async () => {
    const res = await post("/api/auth/member", { identifier: "NX-8492", pin: "0000" });
    expect(res.status).toBe(401);
  });

  it("logs in with the demo credentials and persists plans across logins", async () => {
    const login = await post("/api/auth/member", { identifier: "NX-8492", pin: "1234" });
    const loginData = await login.json();
    expect(login.status).toBe(200);
    expect(loginData.member.memberCode).toBe("NX-8492");
    expect(loginData.member.savedPlans).toEqual([]);

    const plan = { id: "plan-demo-1", splitName: "Demo Split", days: [] };
    const saved = await post("/api/member/workouts", { plan });
    expect((await saved.json()).success).toBe(true);

    const again = await post("/api/auth/member", { identifier: "NX-8492", pin: "1234" });
    const againData = await again.json();
    expect(againData.member.savedPlans.map((p: { id: string }) => p.id)).toContain("plan-demo-1");
  });

  it("exports member data as a downloadable attachment", async () => {
    const res = await api("/api/member/export");
    const text = await res.text();
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(JSON.parse(text).member.memberCode).toBe("NX-8492");
  });

  it("erases demo data", async () => {
    const res = await api("/api/member/erase", { method: "DELETE" });
    expect((await res.json()).success).toBe(true);

    const login = await post("/api/auth/member", { identifier: "NX-8492", pin: "1234" });
    expect((await login.json()).member.savedPlans).toEqual([]);
  });

  it("accepts lead submissions", async () => {
    const res = await post("/api/leads", { fullName: "Demo", email: "demo@example.com" });
    expect((await res.json()).success).toBe(true);
  });
});
