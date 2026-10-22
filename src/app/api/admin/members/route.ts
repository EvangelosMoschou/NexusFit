import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { adminRoute } from "@/lib/api";

export const GET = adminRoute(
  async (_req, tenantId) =>
    NextResponse.json({ success: true, members: await getRepository(tenantId).listMembers() }),
  "Failed to fetch members"
);

export const POST = adminRoute(async (req: NextRequest, tenantId: string) => {
  const body = await req.json();
  const { member } = body;

  if (!member || !member.memberCode || !member.fullName || !member.email) {
    return NextResponse.json({ success: false, error: "Missing required member fields" }, { status: 400 });
  }

  const saved = await getRepository(tenantId).saveMember(member);
  return NextResponse.json({ success: saved });
}, "Failed to save member");

export const DELETE = adminRoute(async (req: NextRequest, tenantId: string) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Missing member ID" }, { status: 400 });
  }

  const deleted = await getRepository(tenantId).deleteMember(id);
  return NextResponse.json({ success: deleted });
}, "Failed to delete member");
