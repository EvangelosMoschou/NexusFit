import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { verifyMemberSession } from "@/lib/session";
import { MEMBER_COOKIE } from "@/lib/cookies";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { isSubscriptionActive } from "@/lib/subscription";
import { accessControlConfigured, signAccessToken } from "@/lib/accessToken";

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const memberId = verifyMemberSession(
    req.cookies.get(MEMBER_COOKIE)?.value,
    tenantId
  );

  if (!memberId) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  if (!accessControlConfigured()) {
    return NextResponse.json(
      { success: false, error: "Η πρόσβαση με QR δεν έχει ρυθμιστεί." },
      { status: 503 }
    );
  }

  const member = await getRepository(tenantId).getMemberAccess(memberId);
  if (!member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  if (!isSubscriptionActive(member.subscription_status, member.expires_at)) {
    return NextResponse.json(
      { success: false, error: "Η συνδρομή σου δεν είναι ενεργή." },
      { status: 403 }
    );
  }

  const token = signAccessToken(tenantId, member.id);
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Το access token δεν έχει ρυθμιστεί." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    success: true,
    token: token.token,
    expiresAt: token.expiresAt,
    memberCode: member.member_code,
  });
}
