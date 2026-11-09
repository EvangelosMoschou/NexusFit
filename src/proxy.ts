import { NextResponse, type NextRequest } from "next/server";
import { isMutatingMethod, isSameOriginRequest } from "@/lib/sameOrigin";

// CSRF guard for the JSON API.
//
// The matcher below restricts this proxy to `/api/*`, so page navigations and
// static assets never pay for it. Within the API only state-changing methods
// are checked; reads and server-to-server callers without an `Origin` header
// pass through untouched (see src/lib/sameOrigin.ts).
export function proxy(req: NextRequest) {
  if (!isMutatingMethod(req.method)) return NextResponse.next();
  if (isSameOriginRequest(req)) return NextResponse.next();

  return NextResponse.json(
    { success: false, error: "Cross-origin request blocked" },
    { status: 403 }
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
