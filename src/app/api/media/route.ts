import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// Public gallery listing. Image bytes are served from /api/media/[id].
export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const media = await getRepository(tenantId).listMedia();

  return NextResponse.json({
    success: true,
    media: media.map((item) => ({ ...item, url: `/api/media/${item.id}` })),
  });
}
