import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
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
  handler: (req: NextRequest, tenantId: string) => Promise<NextResponse> | NextResponse,
  errorMessage: string
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const tenantId = resolveTenantIdFromHeaders(req.headers);

    if (!isAdminRequest(req, tenantId)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
      return await handler(req, tenantId);
    } catch {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
  };
}
