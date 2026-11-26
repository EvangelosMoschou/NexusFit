import type { NextRequest } from "next/server";
import { STAFF_COOKIE, buildSessionCookie } from "@/lib/cookies";
import { getRepository } from "@/lib/db";
import { createStaffSession, getStaffSessionRow, revokeStaffSession } from "@/lib/db/staffSessions";
import type { DbStaffAccount, StaffRole } from "@/lib/db/types";
import { DUMMY_SCRYPT_HASH, verifyPin } from "@/lib/passwordHash";
import {
  hashSessionId,
  issueStaffSession,
  parseStaffSession,
  verifyStaffSessionDetails,
} from "@/lib/session";
import {
  hasStaffPermission,
  permissionsForRole,
  type StaffPermission,
} from "@/lib/staffPermissions";

export interface StaffSession {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  permissions: string[];
  legacy: boolean;
}

export function staffAccountToSession(account: DbStaffAccount): StaffSession {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    permissions: permissionsForRole(account.role, account.permissions),
    legacy: false,
  };
}

export async function getStaffSession(
  req: NextRequest,
  tenantId: string
): Promise<StaffSession | null> {
  const cookie = req.cookies.get(STAFF_COOKIE)?.value;
  const parsed = parseStaffSession(cookie);
  if (!parsed || parsed.tenantId !== tenantId) return null;

  const account = await getRepository(tenantId).getStaffById(parsed.staffId);
  if (!account || !account.active) return null;

  const details = verifyStaffSessionDetails(cookie, tenantId, account.id, account.password_hash);
  if (!details) return null;

  const sessionRow = getStaffSessionRow(hashSessionId(details.sessionId), tenantId);
  if (
    !sessionRow ||
    sessionRow.revoked_at !== null ||
    sessionRow.actor_key !== `staff:${account.id}` ||
    sessionRow.expires_at <= Date.now()
  ) {
    return null;
  }

  return staffAccountToSession(account);
}

export async function authenticateStaff(
  email: string,
  password: string,
  tenantId: string,
  requiredRole: StaffRole
): Promise<DbStaffAccount | null> {
  const repo = getRepository(tenantId);
  const account = await repo.getStaffByEmail(email);
  if (!account || !account.active || account.role !== requiredRole) {
    await verifyPin(password, DUMMY_SCRYPT_HASH);
    return null;
  }

  const valid = await verifyPin(password, account.password_hash);
  if (!valid) return null;

  await repo.touchStaffLogin(account.id);
  return account;
}

export function buildStaffSessionCookie(tenantId: string, account: DbStaffAccount): string | null {
  const issued = issueStaffSession(tenantId, account.id, account.password_hash);
  if (!issued) return null;

  const persisted = createStaffSession(
    {
      id: hashSessionId(issued.sessionId),
      actorKey: `staff:${account.id}`,
      role: account.role,
      expiresAt: issued.expiresAt,
    },
    tenantId
  );
  if (!persisted) return null;

  return buildSessionCookie(STAFF_COOKIE, issued.token);
}

export async function revokeStaffSessionCookie(
  req: NextRequest,
  tenantId: string
): Promise<boolean> {
  const cookie = req.cookies.get(STAFF_COOKIE)?.value;
  const parsed = parseStaffSession(cookie);
  if (!parsed || parsed.tenantId !== tenantId) return false;

  const account = await getRepository(tenantId).getStaffById(parsed.staffId);
  if (!account) return false;

  const details = verifyStaffSessionDetails(cookie, tenantId, account.id, account.password_hash);
  if (!details) return false;

  return revokeStaffSession(hashSessionId(details.sessionId), Date.now(), tenantId);
}

export function hasSessionPermission(session: StaffSession, permission: StaffPermission): boolean {
  return hasStaffPermission(session.role, session.permissions, permission);
}
