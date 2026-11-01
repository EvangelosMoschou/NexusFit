import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/api";
import { getRepository } from "@/lib/db";

export const GET = adminRoute(async (req: NextRequest, tenantId) => {
  const params = req.nextUrl.searchParams;
  const limit = Number(params.get("limit") ?? 50);
  const offset = Number(params.get("offset") ?? 0);

  const page = await getRepository(tenantId).listAudit({
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
    action: params.get("action") || undefined,
    entityType: params.get("entityType") || undefined,
    actorId: params.get("actorId") || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
  });

  return NextResponse.json({ success: true, ...page });
}, "Failed to fetch audit log");
