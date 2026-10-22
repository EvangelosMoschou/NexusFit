import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { SECURE_COOKIES } from "@/lib/cookies";
import { getTenant } from "@/lib/tenants";
import { verifyPin } from "@/lib/passwordHash";

export const ADMIN_COOKIE = "nexusfit_admin";

// The admin session token is derived from the *tenant's* password hash, so a
// session issued for one gym is never accepted by another. Without that binding,
// an admin of one tenant could reach another tenant's data simply by changing
// the Host header.
//
// The admin password hashes are scrypt hashes (same helper as member PINs).
export function adminSessionToken(tenantId: string): string | null {
  const tenant = getTenant(tenantId);
  if (!tenant) return null;
  return createHash("sha256").update(`${tenantId}:${tenant.adminPasswordHash}`).digest("hex");
}

export function adminCredentialsConfigured(tenantId: string): boolean {
  return getTenant(tenantId) !== null;
}

export function verifyAdminPassword(tenantId: string, password: string): boolean {
  const tenant = getTenant(tenantId);
  if (!tenant) return false;
  return verifyPin(password, tenant.adminPasswordHash);
}

export function isAdminRequest(req: NextRequest, tenantId: string): boolean {
  const tok = adminSessionToken(tenantId);
  return Boolean(tok) && req.cookies.get(ADMIN_COOKIE)?.value === tok;
}

export function buildAdminSessionCookie(tenantId: string): string | null {
  const tok = adminSessionToken(tenantId);
  if (!tok) return null;
  const secure = SECURE_COOKIES ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`;
}
