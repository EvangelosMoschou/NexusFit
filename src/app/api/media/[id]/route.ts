import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Image bytes for the public gallery and the admin previews.
export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const media = await getRepository(tenantId).getMedia(id);

  if (!media) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const safeFilename = media.filename.replace(/[^\w.\- ]+/g, "_") || "photo";
  const body = new Blob([Uint8Array.from(media.data)], { type: media.mime });

  return new NextResponse(body, {
    headers: {
      "Content-Type": media.mime,
      "Content-Length": String(body.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${safeFilename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
