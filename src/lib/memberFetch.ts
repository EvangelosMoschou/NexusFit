import { clearMemberSession } from "@/lib/auth";

export const MEMBER_SESSION_EXPIRED_EVENT = "nexusfit:member-session-expired";

// Client-side wrapper for member-only API calls. A 401 means the server-side
// session was revoked or expired, not that the member typed a wrong PIN (the
// login modal uses raw fetch), so it is safe to clear local state and let the
// app return to the public view.
export async function memberFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && typeof window !== "undefined") {
    clearMemberSession();
    window.dispatchEvent(new Event(MEMBER_SESSION_EXPIRED_EVENT));
  }
  return response;
}
