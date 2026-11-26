import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import type { MemberUpdateInput } from "@/lib/db/types";
import { adminRoute } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^\d{4,6}$/;

export const GET = adminRoute(
  async (req, tenantId) => {
    // `?id=` returns one member with their workout history for the admin
    // profile view; without it the endpoint lists every member.
    const id = req.nextUrl.searchParams.get("id");

    if (id) {
      const repo = getRepository(tenantId);
      const detail = await repo.exportMember(id);
      if (!detail.member) {
        return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
      }
      await repo.closeIdleVisits();
      const visits = await repo.getMemberVisits(id, 10);
      const exerciseLogs = await repo.listExerciseLogs(id, 50);
      return NextResponse.json({
        success: true,
        member: detail.member,
        plans: detail.plans,
        visits,
        exerciseLogs,
      });
    }

    return NextResponse.json({
      success: true,
      members: await getRepository(tenantId).listMembers(),
    });
  },
  "Failed to fetch members"
);

export const POST = adminRoute(async (req: NextRequest, tenantId: string, staff) => {
  const body = await req.json();
  const { member } = body;

  if (!member || typeof member !== "object" || Array.isArray(member)) {
    return NextResponse.json({ success: false, error: "Missing required member fields" }, { status: 400 });
  }

  const memberCode = typeof member.memberCode === "string" ? member.memberCode.trim().toUpperCase() : "";
  const fullName = typeof member.fullName === "string" ? member.fullName.trim() : "";
  const email = typeof member.email === "string" ? member.email.trim().toLowerCase() : "";
  const pinCode = typeof member.pinCode === "string" ? member.pinCode.trim() : "";

  if (!memberCode || !fullName || !email || !pinCode) {
    return NextResponse.json({ success: false, error: "Missing required member fields" }, { status: 400 });
  }

  if (
    !EMAIL_RE.test(email) ||
    !PIN_RE.test(pinCode) ||
    fullName.length < 2 ||
    fullName.length > 80 ||
    memberCode.length < 3
  ) {
    return NextResponse.json(
      { success: false, error: "Μη έγκυρα στοιχεία μέλους (barcode, όνομα, email ή PIN)." },
      { status: 400 }
    );
  }

  const repo = getRepository(tenantId);
  const existing = await repo.listMembers();
  if (existing.some((m) => m.email.toLowerCase() === email && m.member_code !== memberCode)) {
    return NextResponse.json(
      { success: false, error: "Υπάρχει ήδη μέλος με αυτό το email." },
      { status: 409 }
    );
  }

  const saved = await repo.saveMember(member);
  if (!saved) {
    return NextResponse.json(
      { success: false, error: "Η αποθήκευση απέτυχε. Ελέγξτε ότι το barcode/email είναι μοναδικά." },
      { status: 400 }
    );
  }

  await writeAudit(
    req,
    tenantId,
    staff,
    "member.save",
    "member",
    typeof member.id === "string" ? member.id : null,
    { hasAIAccess: Boolean(member.hasAIAccess) }
  );
  return NextResponse.json({ success: true });
}, "Failed to save member");

export const PATCH = adminRoute(async (req: NextRequest, tenantId: string, staff) => {
  const body = await req.json();
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing member ID" }, { status: 400 });
  }

  const rawSource =
    body?.updates && typeof body.updates === "object" && !Array.isArray(body.updates)
      ? body.updates
      : body;

  const patch: MemberUpdateInput = {};
  if (rawSource.fullName !== undefined) patch.fullName = rawSource.fullName;
  if (rawSource.email !== undefined) patch.email = rawSource.email;
  if (rawSource.tierName !== undefined) patch.tierName = rawSource.tierName;
  if (rawSource.hasAIAccess !== undefined) patch.hasAIAccess = rawSource.hasAIAccess;
  if (rawSource.subscriptionStatus !== undefined) {
    patch.subscriptionStatus = rawSource.subscriptionStatus;
  }
  if (rawSource.expiresAt !== undefined) patch.expiresAt = rawSource.expiresAt;
  if (typeof rawSource.pinCode === "string" && rawSource.pinCode.trim().length > 0) {
    patch.pinCode = rawSource.pinCode;
  }

  const result = await getRepository(tenantId).updateMember(id, patch);
  if (!result.ok) {
    const status =
      result.code === "not_found" ? 404 : result.code === "conflict" ? 409 : 400;
    return NextResponse.json({ success: false, error: result.error }, { status });
  }

  await writeAudit(req, tenantId, staff, "member.update", "member", id, {
    fields: Object.keys(patch).filter((key) => key !== "pinCode"),
    pinRotated: result.pinRotated,
  });

  return NextResponse.json({ success: true, member: result.member });
}, "Failed to update member");

export const DELETE = adminRoute(async (req: NextRequest, tenantId: string, staff) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Missing member ID" }, { status: 400 });
  }

  // Admin deletion is the GDPR erasure path too: member, plans, visits
  // (cascade) and lead inquiries sharing the same email.
  const deleted = await getRepository(tenantId).eraseMember(id);
  if (deleted) {
    await writeAudit(req, tenantId, staff, "member.erase", "member", id);
  }
  return NextResponse.json({ success: deleted });
}, "Failed to delete member");
