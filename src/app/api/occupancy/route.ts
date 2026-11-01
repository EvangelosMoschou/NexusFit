import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { canViewOccupancy } from "@/lib/occupancyAccess";

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);

  if (!(await canViewOccupancy(req, tenantId))) {
    return NextResponse.json({
      success: true,
      locked: true,
      updatedAt: new Date().toISOString(),
    });
  }

  const occupancy = await getRepository(tenantId).getOccupancy();
  return NextResponse.json({
    success: true,
    locked: false,
    inside: occupancy.inside,
    capacity: occupancy.capacity,
    updatedAt: new Date().toISOString(),
  });
}
