import type { NextRequest } from "next/server";
import { getRepository } from "@/lib/db";
import { getClientIp } from "@/lib/rateLimit";
import type { StaffSession } from "@/lib/staffAuth";

export interface AuditActor {
  id: string | null;
  name: string;
  email: string;
  role: string;
  legacy: boolean;
}

export function auditActor(staff: StaffSession | null): AuditActor {
  if (!staff) {
    return {
      id: null,
      name: "Κύριος διαχειριστής (legacy)",
      email: "",
      role: "admin",
      legacy: true,
    };
  }

  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    legacy: staff.legacy,
  };
}

// Best-effort: an audit failure must never break the operation the user asked
// for. The error is logged for operators.
export async function writeAudit(
  req: NextRequest | null,
  tenantId: string,
  staff: StaffSession | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const actor = auditActor(staff);
    await getRepository(tenantId).logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      actorLegacy: actor.legacy,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details ?? {},
      ip: req ? getClientIp(req.headers) : null,
    });
  } catch (error) {
    console.error("[audit] failed to write entry:", error);
  }
}

export async function writeSystemAudit(
  req: NextRequest | null,
  tenantId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
  actorName = "Συσκευή πρόσβασης"
): Promise<void> {
  try {
    await getRepository(tenantId).logAudit({
      actorId: null,
      actorName,
      actorEmail: null,
      actorRole: "system",
      actorLegacy: false,
      action,
      entityType,
      entityId,
      details,
      ip: req ? getClientIp(req.headers) : null,
    });
  } catch (error) {
    console.error("[audit] failed to write system entry:", error);
  }
}
