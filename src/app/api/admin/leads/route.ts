import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { adminRoute } from "@/lib/api";

export const GET = adminRoute(
  async (_req, tenantId) =>
    NextResponse.json({ success: true, leads: await getRepository(tenantId).listLeads() }),
  "Failed to fetch leads"
);

export const POST = adminRoute(async (req: NextRequest, tenantId: string) => {
  const body = await req.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ success: false, error: "Missing id or status" }, { status: 400 });
  }

  const updated = await getRepository(tenantId).updateLeadStatus(id, status);
  return NextResponse.json({ success: updated });
}, "Failed to update lead status");

export const DELETE = adminRoute(async (req: NextRequest, tenantId: string) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Missing lead ID" }, { status: 400 });
  }

  const deleted = await getRepository(tenantId).deleteLead(id);
  return NextResponse.json({ success: deleted });
}, "Failed to delete lead");
