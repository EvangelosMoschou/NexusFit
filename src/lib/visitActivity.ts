// A lightweight activity signal for the member's open visit. The visit endpoint
// ignores it when the member is not checked in, so it is safe to call from
// shared workout components.
export function pingVisitActivity(): void {
  if (typeof window === "undefined") return;

  void fetch("/api/member/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "heartbeat" }),
    keepalive: true,
  }).catch(() => {});
}
