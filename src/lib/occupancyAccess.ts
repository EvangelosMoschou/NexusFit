import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { isLegacyTrainerRequest } from "@/lib/trainerAuth";
import { getStaffSession } from "@/lib/staffAuth";
import { hasStaffPermission } from "@/lib/staffPermissions";
import { authenticateMemberSession } from "@/lib/memberSessions";
import { getRepository } from "@/lib/db";
import { isPremiumSubscriptionActive } from "@/lib/subscription";

// Occupancy (live or historical) is a member benefit. Staff with the right
// permission see it without a member subscription.
export async function canViewOccupancy(req: NextRequest, tenantId: string): Promise<boolean> {
  const staff = await getStaffSession(req, tenantId);

  if (
    isAdminRequest(req, tenantId) ||
    staff?.role === "admin" ||
    (staff?.role === "trainer" &&
      hasStaffPermission(staff.role, staff.permissions, "occupancy_view")) ||
    isLegacyTrainerRequest(req, tenantId)
  ) {
    return true;
  }

  const session = await authenticateMemberSession(req, tenantId);
  if (!session) return false;

  const member = await getRepository(tenantId).getMemberAccess(session.memberId);
  return Boolean(
    member &&
    isPremiumSubscriptionActive(member.subscription_status, member.expires_at, member.has_ai_access)
  );
}
