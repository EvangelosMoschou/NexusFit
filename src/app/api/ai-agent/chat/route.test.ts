import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-ai-chat-route-"));
process.env.SQLITE_DATA_DIR = tempDir;
process.env.SESSION_SECRET = "test-session-secret-for-ai-chat-route-1234";

import { POST } from "./route";
import { MEMBER_COOKIE } from "@/lib/cookies";
import { createMemberSession } from "@/lib/memberSessions";
import { getMemberByCredentials, upsertMemberAdmin } from "@/lib/sqliteDb";

let aiCookie = "";
let stdCookie = "";

async function makeSignedCookie(memberId: string): Promise<string> {
  const req = new NextRequest("http://localhost/api/auth/member", {
    headers: { host: "localhost" },
  });
  const token = await createMemberSession("default", memberId, req);
  if (!token) throw new Error("Failed to create member session for test");
  return `${MEMBER_COOKIE}=${token}`;
}

function chatRequest(body: unknown, cookie?: string, ip = "198.51.100.10"): NextRequest {
  const headers: Record<string, string> = {
    host: "localhost",
    "content-type": "application/json",
    "x-real-ip": ip,
  };
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost/api/ai-agent/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const futureExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await upsertMemberAdmin({
    memberCode: "NX-CHAT-AI",
    fullName: "AI Chat Member",
    email: "chat-ai@example.com",
    pinCode: "1234",
    tierName: "Πλήρης Πρόσβαση & Ψηφιακός Βοηθός",
    hasAIAccess: true,
    subscriptionStatus: "active",
    expiresAt: futureExpiry,
  });

  await upsertMemberAdmin({
    memberCode: "NX-CHAT-STD",
    fullName: "Standard Chat Member",
    email: "chat-std@example.com",
    pinCode: "1234",
    tierName: "Βασικό Πακέτο",
    hasAIAccess: false,
    subscriptionStatus: "active",
    expiresAt: futureExpiry,
  });

  const aiMember = (await getMemberByCredentials("NX-CHAT-AI", "1234"))!;
  const stdMember = (await getMemberByCredentials("NX-CHAT-STD", "1234"))!;
  aiCookie = await makeSignedCookie(aiMember.id);
  stdCookie = await makeSignedCookie(stdMember.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("POST /api/ai-agent/chat", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(chatRequest({ query: "Γεια" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for an active standard member without AI access", async () => {
    const res = await POST(chatRequest({ query: "Πιέσεις στήθους" }, stdCookie, "198.51.100.11"));
    expect(res.status).toBe(403);
  });

  it("returns 400 on empty or oversized queries", async () => {
    const emptyRes = await POST(chatRequest({ query: "   " }, aiCookie, "198.51.100.12"));
    expect(emptyRes.status).toBe(400);

    const longRes = await POST(
      chatRequest({ query: "a".repeat(1001) }, aiCookie, "198.51.100.13")
    );
    expect(longRes.status).toBe(400);
  });

  it("falls back to the local deterministic engine when GEMINI_API_KEY is unset", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await POST(
      chatRequest({ query: "Εναλλακτική για πιέσεις πάγκου" }, aiCookie, "198.51.100.14")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sender).toBe("agent");
    expect(typeof data.text).toBe("string");
    expect(data.text.length).toBeGreaterThan(0);
  });

  it("calls Gemini with x-goog-api-key header (never query string) and sanitized history", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake-gemini-key-for-test");
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Δοκίμασε πιέσεις με αλτήρες." }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(
      chatRequest(
        {
          query: "Τι μπορώ να κάνω για στήθος;",
          history: [
            { role: "user", text: "Προηγούμενη ερώτηση" },
            { role: "system", text: "ignored invalid role" },
            { role: "model", text: "Προηγούμενη απάντηση" },
          ],
        },
        aiCookie,
        "198.51.100.15"
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe("Δοκίμασε πιέσεις με αλτήρες.");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).not.toContain("key=");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "x-goog-api-key": "fake-gemini-key-for-test",
    });
    const sentPayload = JSON.parse(String(init.body));
    expect(sentPayload.contents).toEqual([
      { role: "user", parts: [{ text: "Προηγούμενη ερώτηση" }] },
      { role: "model", parts: [{ text: "Προηγούμενη απάντηση" }] },
      { role: "user", parts: [{ text: "Τι μπορώ να κάνω για στήθος;" }] },
    ]);
  });

  it("returns 429 with Retry-After after exceeding the per-member rate limit", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    let lastRes: Response | null = null;
    for (let i = 0; i < 20; i++) {
      lastRes = await POST(chatRequest({ query: "Γρήγορη συμβουλή" }, aiCookie, `198.51.100.${50 + i}`));
      if (lastRes.status === 429) break;
    }
    expect(lastRes?.status).toBe(429);
    expect(Number(lastRes?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
