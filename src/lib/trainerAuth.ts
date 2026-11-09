import type { NextRequest } from "next/server";
import { TRAINER_COOKIE, buildSessionCookie } from "@/lib/cookies";
import { getTenant } from "@/lib/tenants";
import { verifyPin } from "@/lib/passwordHash";
import { signTrainerSession, verifyTrainerSession } from "@/lib/session";
import { getStaffSession, type StaffSession } from "@/lib/staffAuth";
import { LEGACY_TRAINER_PERMISSIONS } from "@/lib/staffPermissions";

// Restricted staff role. It can view member profiles and occupancy (and record
// a desk check-in/out), but every admin route requires the separate admin
// cookie, so it cannot change members, pricing, config or announcements.
export function trainerCredentialsConfigured(tenantId: string): boolean {
  const tenant = getTenant(tenantId);
  return Boolean(tenant?.trainerPasswordHash);
}

export async function verifyTrainerPassword(tenantId: string, password: string): Promise<boolean> {
  const tenant = getTenant(tenantId);
  if (!tenant?.trainerPasswordHash) return false;
  return verifyPin(password, tenant.trainerPasswordHash);
}

export function buildTrainerSessionCookie(tenantId: string): string | null {
  const passwordHash = getTenant(tenantId)?.trainerPasswordHash;
  if (!passwordHash) return null;

  const token = signTrainerSession(tenantId, passwordHash);
  if (!token) return null;
  return buildSessionCookie(TRAINER_COOKIE, token);
}

export function isLegacyTrainerRequest(req: NextRequest, tenantId: string): boolean {
  const passwordHash = getTenant(tenantId)?.trainerPasswordHash;
  if (!passwordHash) return false;
  return verifyTrainerSession(req.cookies.get(TRAINER_COOKIE)?.value, tenantId, passwordHash);
}

// Legacy shared TRAINER_PASSWORD accounts keep the original capabilities.
export function legacyTrainerSession(): StaffSession {
  return {
    id: "legacy-trainer",
    name: "Κοινός λογαριασμός προσωπικού",
    email: "",
    role: "trainer",
    permissions: [...LEGACY_TRAINER_PERMISSIONS],
    legacy: true,
  };
}

// Used by /trainer: staff trainer account first, then the legacy cookie.
export async function getTrainerAccess(
  req: NextRequest,
  tenantId: string
): Promise<StaffSession | null> {
  const staff = await getStaffSession(req, tenantId);
  if (staff?.role === "trainer") return staff;
  if (isLegacyTrainerRequest(req, tenantId)) return legacyTrainerSession();
  return null;
}
