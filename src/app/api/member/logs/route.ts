import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { authenticateMemberSession } from "@/lib/memberSessions";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";

export async function GET(req: NextRequest) {
  const tenantId = resolveTenantIdFromHeaders(req.headers);
  const session = await authenticateMemberSession(req, tenantId);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const logs = await getRepository(tenantId).listExerciseLogs(session.memberId, 200);
  return NextResponse.json(
    { success: true, logs },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = resolveTenantIdFromHeaders(req.headers);
    const session = await authenticateMemberSession(req, tenantId);
    if (!session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: "Μη έγκυρη καταγραφή βάρους." },
        { status: 400 }
      );
    }

    const rawName =
      typeof body.exerciseName === "string"
        ? body.exerciseName
        : typeof body.exerciseId === "string"
          ? body.exerciseId
          : "";
    const repsValue = body.reps !== undefined ? body.reps : (body.repsAchieved ?? 8);

    const log = await getRepository(tenantId).saveExerciseLog(session.memberId, {
      exerciseName: rawName,
      weightKg: Number(body.weightKg),
      reps: Number(repsValue),
      loggedAt: typeof body.loggedAt === "string" ? body.loggedAt : undefined,
    });

    if (!log) {
      return NextResponse.json(
        { success: false, error: "Μη έγκυρη καταγραφή βάρους." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, log }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Database error saving exercise log" },
      { status: 500 }
    );
  }
}
