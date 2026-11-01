import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/api";

export const GET = adminRoute(
  async (_req, _tenantId, staff) =>
    NextResponse.json({
      success: true,
      staff: staff
        ? {
            id: staff.id,
            name: staff.name,
            email: staff.email,
            role: staff.role,
            legacy: staff.legacy,
          }
        : null,
    }),
  "Failed to verify admin session"
);
