import { NextResponse } from "next/server";
import { trainerRoute } from "@/lib/api";

export const GET = trainerRoute(
  async (_req, _tenantId, staff) =>
    NextResponse.json({
      success: true,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        permissions: staff.permissions,
        legacy: staff.legacy,
      },
    }),
  "Failed to verify trainer session"
);
