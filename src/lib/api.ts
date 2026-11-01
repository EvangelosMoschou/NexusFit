import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { getTrainerAccess } from "@/lib/trainerAuth";
import { getStaffSession, type StaffSession } from "@/lib/staffAuth";
import { hasStaffPermission, type StaffPermission } from "@/lib/staffPermissions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// Shared JSON envelope helpers so every endpoint answers with the same shape:
//   success path -> { success: true, ...data }
//   error path   -> { success: false, error: "<stable code>", message?: "<user text>" }
// `error` is a short machine-readable string; `message` carries the user-facing
// (Greek) text so the UI never has to parse the code.
export function jsonOk(data: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ success: true, ...data });
}

export function jsonError(error: string, status: number, message?: string): NextResponse {
  return NextResponse.json({ success: false, error, ...(message ? { message } : {}) }, { status });
}

// Shared wrapper for admin-only route handlers. It resolves the tenant from the
// request host, then enforces that tenant's session guard, so an admin session
// is only ever valid for its own gym. The resolved tenant is handed to the
// handler so it does not have to resolve it again.
export function adminRoute(
  handler: (
    req: NextRequest,
    tenantId: string,
    staff: StaffSession | null
  ) => Promise<NextResponse> | NextResponse,
  errorMessage: string
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const tenantId = resolveTenantIdFromHeaders(req.headers);

    let staff: StaffSession | null = null;
    if (!isAdminRequest(req, tenantId)) {
      staff = await getStaffSession(req, tenantId);
      if (staff?.role !== "admin") {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    try {
      return await handler(req, tenantId, staff);
    } catch {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
  };
}

// Restricted staff routes. A trainer session is never accepted by an admin
// handler, and the required permission is checked server-side.
export function trainerRoute(
  handler: (
    req: NextRequest,
    tenantId: string,
    staff: StaffSession
  ) => Promise<NextResponse> | NextResponse,
  errorMessage: string,
  permission?: StaffPermission | StaffPermission[]
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    const staff = await getTrainerAccess(req, tenantId);

    if (!staff) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (permission) {
      const required = Array.isArray(permission) ? permission : [permission];
      const allowed = required.some((key) =>
        hasStaffPermission(staff.role, staff.permissions, key)
      );
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: "Δεν έχεις αυτό το δικαίωμα." },
          { status: 403 }
        );
      }
    }

    try {
      return await handler(req, tenantId, staff);
    } catch {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
  };
}
