import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, phone, goal, preferredPlan, notes } = body;

    if (!fullName || !email) {
      return NextResponse.json(
        { success: false, error: "Συμπληρώστε ονοματεπώνυμο και email." },
        { status: 400 }
      );
    }

    const saved = await getRepository(resolveTenantIdFromHeaders(req.headers)).saveLead({
      fullName,
      email,
      phone,
      goal,
      preferredPlan,
      notes,
    });

    return NextResponse.json({ success: saved });
  } catch {
    return NextResponse.json(
      { success: false, error: "Database error saving lead inquiry" },
      { status: 500 }
    );
  }
}
