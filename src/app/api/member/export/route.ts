import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { verifyMemberSession } from "@/lib/session";
import { MEMBER_COOKIE } from "@/lib/cookies";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

// GDPR right of access / portability: returns the signed-in member's own data
// as a downloadable JSON file.
export async function GET(req: NextRequest) {
  const memberId = verifyMemberSession(req.cookies.get(MEMBER_COOKIE)?.value);

  if (!memberId) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const data = await getRepository(resolveTenantIdFromHeaders(req.headers)).exportMember(memberId);
  if (!data.member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, exportedAt: new Date().toISOString(), ...data },
    {
      headers: {
        "Content-Disposition": `attachment; filename="nexusfit-data-${memberId}.json"`,
      },
    }
  );
}
