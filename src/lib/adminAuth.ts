import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, buildSessionCookie } from "@/lib/cookies";
import { createStaffSession, getStaffSessionRow, revokeStaffSession } from "@/lib/db/staffSessions";
import { getTenant } from "@/lib/tenants";
import { DUMMY_SCRYPT_HASH, verifyPin } from "@/lib/passwordHash";
import { hashSessionId, issueAdminSession, verifyAdminSession } from "@/lib/session";

// Re-exported so existing imports keep working; the name itself lives with the
// other session cookies in src/lib/cookies.ts (where the `__Host-` prefix and
// the cookie attributes are decided).
export { ADMIN_COOKIE };

// The admin session token is derived from the *tenant's* password hash, so a
// session issued for one gym is never accepted by another. Without that binding,
// an admin of one tenant could reach another tenant's data simply by changing
// the Host header.
//
// The admin password hashes are scrypt hashes (same helper as member PINs).
export function adminSessionToken(tenantId: string): string | null {
  const tenant = getTenant(tenantId);
  if (!tenant?.adminPasswordHash) return null;

  const issued = issueAdminSession(tenantId, tenant.adminPasswordHash);
  if (!issued) return null;

  const persisted = createStaffSession(
    {
      id: hashSessionId(issued.sessionId),
      actorKey: "legacy:admin",
      role: "admin",
      expiresAt: issued.expiresAt,
    },
    tenantId
  );
  return persisted ? issued.token : null;
}

export function adminCredentialsConfigured(tenantId: string): boolean {
  return getTenant(tenantId) !== null;
}

export async function verifyAdminPassword(tenantId: string, password: string): Promise<boolean> {
  const tenant = getTenant(tenantId);
  if (!tenant?.adminPasswordHash) {
    await verifyPin(password, DUMMY_SCRYPT_HASH);
    return false;
  }
  return verifyPin(password, tenant.adminPasswordHash);
}

export function isAdminRequest(req: NextRequest, tenantId: string): boolean {
  const tenant = getTenant(tenantId);
  if (!tenant?.adminPasswordHash) return false;

  const raw = req.cookies.get(ADMIN_COOKIE)?.value;
  const details = verifyAdminSession(raw, tenantId, tenant.adminPasswordHash);
  if (!details) return false;

  const sessionRow = getStaffSessionRow(hashSessionId(details.sessionId), tenantId);
  return Boolean(
    sessionRow &&
      sessionRow.revoked_at === null &&
      sessionRow.actor_key === "legacy:admin" &&
      sessionRow.expires_at > Date.now()
  );
}

export function revokeAdminSession(req: NextRequest, tenantId: string): boolean {
  const tenant = getTenant(tenantId);
  if (!tenant?.adminPasswordHash) return false;

  const details = verifyAdminSession(
    req.cookies.get(ADMIN_COOKIE)?.value,
    tenantId,
    tenant.adminPasswordHash
  );
  if (!details) return false;

  return revokeStaffSession(hashSessionId(details.sessionId), Date.now(), tenantId);
}

export function buildAdminSessionCookie(tenantId: string): string | null {
  const tok = adminSessionToken(tenantId);
  if (!tok) return null;
  return buildSessionCookie(ADMIN_COOKIE, tok);
}
