import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // `success` keeps the standard envelope; `ok` is retained so existing uptime
  // probes that check it keep working.
  return NextResponse.json({
    success: true,
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
