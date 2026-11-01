import type { NextRequest } from "next/server";
import { STAFF_COOKIE, SECURE_COOKIES } from "@/lib/cookies";
import { getRepository } from "@/lib/db";
import type { DbStaffAccount, StaffRole } from "@/lib/db/types";
import { verifyPin } from "@/lib/passwordHash";
import {
  parseStaffSession,
  signStaffSession,
  verifyStaffSession,
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
  if (!verifyStaffSession(cookie, tenantId, account.id, account.password_hash)) {
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
  if (!account || !account.active || account.role !== requiredRole) return null;

  const valid = await verifyPin(password, account.password_hash);
  if (!valid) return null;

  await repo.touchStaffLogin(account.id);
  return account;
}

export function buildStaffSessionCookie(
  tenantId: string,
  account: DbStaffAccount
): string | null {
  const token = signStaffSession(tenantId, account.id, account.password_hash);
  if (!token) return null;
  const secure = SECURE_COOKIES ? "; Secure" : "";
  return `${STAFF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`;
}

export function hasSessionPermission(
  session: StaffSession,
  permission: StaffPermission
): boolean {
  return hasStaffPermission(session.role, session.permissions, permission);
}
