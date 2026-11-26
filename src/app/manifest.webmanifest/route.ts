import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const config = await getRepository(tenantId).getGymConfig();

  const manifest = {
    name: `${config.gymName} - Fitness & AI Coach`,
    short_name: config.gymName,
    description: config.tagline || config.description,
    start_url: "/",
    display: "standalone",
    background_color: "#181A20",
    theme_color: "#181A20",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
    categories: ["fitness", "lifestyle", "health"],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
