import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-member-sessions-"));
process.env.SQLITE_DATA_DIR = tempDir;
process.env.SESSION_SECRET = "member-session-test-secret-123456";

import { NextRequest } from "next/server";
import { getRepository } from "@/lib/db";
import { MEMBER_COOKIE } from "@/lib/cookies";
import { parseMemberSession } from "@/lib/session";
import {
  MEMBER_SESSION_IDLE_MS,
  authenticateMemberSession,
  createMemberSession,
  hashMemberSessionId,
  listActiveMemberSessions,
  revokeAllMemberSessions,
  revokeCurrentMemberSession,
} from "./memberSessions";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const TENANT = "default";

async function demoMember() {
  const member = await getRepository(TENANT).authenticateMember("NX-8492", "1234");
  expect(member).not.toBeNull();
  return member!;
}

function loginRequest(): NextRequest {
  return new NextRequest("http://localhost/api/auth/member", {
    method: "POST",
    headers: {
      "user-agent": "Vitest Browser",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

function requestWithToken(token: string): NextRequest {
  return new NextRequest("http://localhost/api/member/sessions", {
    headers: { cookie: `${MEMBER_COOKIE}=${token}` },
  });
}

describe("server-side member sessions", () => {
  beforeEach(async () => {
    const member = await demoMember();
    await getRepository(TENANT).revokeAllMemberSessions(member.id, Date.now());
  });

  it("creates a session whose raw id is not stored", async () => {
    const member = await demoMember();
    const token = await createMemberSession(TENANT, member.id, loginRequest());
    expect(token).toBeTruthy();

    const parsed = parseMemberSession(token!, TENANT);
    expect(parsed?.memberId).toBe(member.id);
    expect(parsed?.sessionId).toBeTruthy();

    const hash = hashMemberSessionId(parsed!.sessionId);
    const row = await getRepository(TENANT).getMemberSession(hash);
    expect(row?.member_id).toBe(member.id);
    expect(row?.session_id_hash).toBe(hash);
    expect(row?.user_agent).toBe("Vitest Browser");
    expect(row?.ip).toBe("127.0.0.1");

    const session = await authenticateMemberSession(requestWithToken(token!), TENANT);
    expect(session?.memberId).toBe(member.id);
    expect(session?.sessionIdHash).toBe(hash);

    const audit = await getRepository(TENANT).listAudit({
      action: "member.session.login",
      limit: 20,
    });
    expect(
      audit.entries.some((entry) => entry.entity_id === member.id && entry.actor_role === "member")
    ).toBe(true);
  });

  it("lists active sessions with the current one flagged", async () => {
    const member = await demoMember();
    const token = await createMemberSession(TENANT, member.id, loginRequest());
    const sessions = await listActiveMemberSessions(requestWithToken(token!), TENANT);

    expect(sessions).not.toBeNull();
    expect(sessions).toHaveLength(1);
    expect(sessions![0].current).toBe(true);
    expect(sessions![0].expiresAt).toBeGreaterThan(Date.now());
  });

  it("rejects and revokes a session after the idle timeout", async () => {
    const member = await demoMember();
    const token = await createMemberSession(TENANT, member.id, loginRequest());
    const parsed = parseMemberSession(token!, TENANT)!;
    const hash = hashMemberSessionId(parsed.sessionId);

    expect(
      await getRepository(TENANT).touchMemberSession(
        hash,
        Date.now() - MEMBER_SESSION_IDLE_MS - 1_000
      )
    ).toBe(true);

    expect(await authenticateMemberSession(requestWithToken(token!), TENANT)).toBeNull();
    expect((await getRepository(TENANT).getMemberSession(hash))?.revoked_at).not.toBeNull();
  });

  it("revokes the current session and all sessions", async () => {
    const member = await demoMember();
    const first = await createMemberSession(TENANT, member.id, loginRequest());
    const second = await createMemberSession(TENANT, member.id, loginRequest());

    expect(await revokeCurrentMemberSession(requestWithToken(first!), TENANT)).toBe(member.id);
    expect(await authenticateMemberSession(requestWithToken(first!), TENANT)).toBeNull();
    expect(await authenticateMemberSession(requestWithToken(second!), TENANT)).not.toBeNull();

    expect(await revokeAllMemberSessions(TENANT, member.id)).toBeGreaterThanOrEqual(1);
    expect(await authenticateMemberSession(requestWithToken(second!), TENANT)).toBeNull();
  });
});
