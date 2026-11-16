// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemberSessionsCard } from "@/components/member/MemberSessionsCard";
import { MEMBER_SESSION_EXPIRED_EVENT } from "@/lib/memberFetch";

const HOUR = 60 * 60 * 1000;

function session(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sess-aaaaaaaaaaaa",
    createdAt: Date.now() - 3 * HOUR,
    lastSeenAt: Date.now() - 10 * 60 * 1000,
    expiresAt: Date.now() + 24 * HOUR,
    ip: "203.0.113.7",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    current: false,
    ...overrides,
  };
}

const CURRENT = session({
  id: "sess-current0000",
  current: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
});
const OTHER = session({
  id: "sess-other444444",
  userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
  ip: "198.51.100.42",
});

/** Routes by method so one stub serves the list GET and the revoke DELETE. */
function mockSessions(options: {
  sessions?: unknown[];
  listOk?: boolean;
  revokeOk?: boolean;
  revokeStatus?: number;
}) {
  const spy = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      const ok = options.revokeOk ?? true;
      return {
        ok,
        status: options.revokeStatus ?? (ok ? 200 : 500),
        json: async () => ({ success: ok }),
      };
    }
    const ok = options.listOk ?? true;
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ success: ok, sessions: options.sessions ?? [] }),
    };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("MemberSessionsCard (device revocation)", () => {
  it("lists each device with a readable label and the current one marked", async () => {
    mockSessions({ sessions: [CURRENT, OTHER] });
    render(<MemberSessionsCard onLogout={() => {}} onLogoutAll={() => {}} />);

    await waitFor(() => expect(screen.getByText("iPhone / iPad")).toBeTruthy());
    expect(screen.getByText("Linux")).toBeTruthy();
    // Exactly one session is "Τρέχουσα"; marking the wrong one would make a
    // member revoke the device they are sitting in front of.
    expect(screen.getAllByText("Τρέχουσα")).toHaveLength(1);
    // Each device's IP is shown, so the member can spot a stranger.
    expect(screen.getByText(/203\.0\.113\.7/)).toBeTruthy();
    expect(screen.getByText(/198\.51\.100\.42/)).toBeTruthy();
  });

  it("revokes another device only after the member confirms", async () => {
    const spy = mockSessions({ sessions: [CURRENT, OTHER] });
    const onLogout = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemberSessionsCard onLogout={onLogout} onLogoutAll={() => {}} />);

    await waitFor(() => expect(screen.getAllByText("Τερματισμός")).toHaveLength(2));
    // Index 1 is the other device; index 0 is the current one.
    fireEvent.click(screen.getAllByText("Τερματισμός")[1]);

    expect(confirmSpy).toHaveBeenCalledWith("Να τερματιστεί η συγκεκριμένη συνεδρία;");
    await waitFor(() =>
      expect(spy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
    );

    const del = spy.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(del?.[0]).toBe("/api/member/sessions?id=sess-other444444");
    // Revoking someone ELSE's device must not sign this member out.
    expect(onLogout).not.toHaveBeenCalled();
    // The revoked row disappears from the list.
    await waitFor(() => expect(screen.getAllByText("Τερματισμός")).toHaveLength(1));
  });

  it("does nothing at all when the member cancels the confirmation", async () => {
    const spy = mockSessions({ sessions: [CURRENT, OTHER] });
    const onLogout = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MemberSessionsCard onLogout={onLogout} onLogoutAll={() => {}} />);

    await waitFor(() => expect(screen.getAllByText("Τερματισμός")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("Τερματισμός")[1]);

    // A cancelled destructive action must not reach the server.
    await Promise.resolve();
    expect(spy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(screen.getAllByText("Τερματισμός")).toHaveLength(2);
  });

  it("signs the member out when they revoke the device they are using", async () => {
    // The current session is index 0. The server clears the HttpOnly cookie, so
    // the client only has to drop its own state — but it MUST do so, or the
    // member keeps browsing a page whose session is gone.
    mockSessions({ sessions: [CURRENT, OTHER] });
    const onLogout = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemberSessionsCard onLogout={onLogout} onLogoutAll={() => {}} />);

    await waitFor(() => expect(screen.getAllByText("Τερματισμός")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("Τερματισμός")[0]);

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });

  it('asks for the "all devices" confirmation with the current device named', async () => {
    mockSessions({ sessions: [CURRENT, OTHER] });
    const onLogoutAll = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemberSessionsCard onLogout={() => {}} onLogoutAll={onLogoutAll} />);

    await waitFor(() => expect(screen.getByText("Αποσύνδεση από όλες τις συσκευές")).toBeTruthy());
    fireEvent.click(screen.getByText("Αποσύνδεση από όλες τις συσκευές"));

    // The wording must warn that THIS device goes too — the one mistake that
    // logs the member out of everything by accident.
    expect(confirmSpy).toHaveBeenCalledWith(
      "Να αποσυνδεθείτε από όλες τις συσκευές, συμπεριλαμβανομένης αυτής;"
    );
    expect(onLogoutAll).toHaveBeenCalledTimes(1);
  });

  it("does not sign out of all devices when the member cancels", async () => {
    mockSessions({ sessions: [CURRENT, OTHER] });
    const onLogoutAll = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MemberSessionsCard onLogout={() => {}} onLogoutAll={onLogoutAll} />);

    await waitFor(() => expect(screen.getByText("Αποσύνδεση από όλες τις συσκευές")).toBeTruthy());
    fireEvent.click(screen.getByText("Αποσύνδεση από όλες τις συσκευές"));

    expect(onLogoutAll).not.toHaveBeenCalled();
  });

  it("keeps the revoked device listed when the server refuses", async () => {
    const spy = mockSessions({ sessions: [CURRENT, OTHER], revokeOk: false, revokeStatus: 500 });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemberSessionsCard onLogout={() => {}} onLogoutAll={() => {}} />);

    await waitFor(() => expect(screen.getAllByText("Τερματισμός")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("Τερματισμός")[1]);

    await waitFor(() =>
      expect(screen.getByText("Η συνεδρία δεν τερματίστηκε. Δοκιμάστε ξανά.")).toBeTruthy()
    );
    // A failed revoke must NOT drop the row: the member would believe a
    // stranger's device is gone when it is still signed in.
    expect(screen.getAllByText("Τερματισμός")).toHaveLength(2);
    expect(spy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
  });

  it("says so when the list itself cannot be loaded", async () => {
    mockSessions({ listOk: false });
    render(<MemberSessionsCard onLogout={() => {}} onLogoutAll={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText("Δεν ήταν δυνατή η φόρτωση των συνεδριών.")).toBeTruthy()
    );
    // The "all devices" escape hatch stays available even when the list fails:
    // a member who suspects a compromise must still be able to sign out.
    expect(screen.getByText("Αποσύνδεση από όλες τις συσκευές")).toBeTruthy();
  });

  it("shows an empty state rather than a blank card", async () => {
    mockSessions({ sessions: [] });
    render(<MemberSessionsCard onLogout={() => {}} onLogoutAll={() => {}} />);

    await waitFor(() => expect(screen.getByText("Δεν βρέθηκαν ενεργές συνεδρίες.")).toBeTruthy());
  });

  it("clears the member session and emits the expiry event on a 401", async () => {
    // memberFetch is the only thing that turns a revoked server session into a
    // signed-out client. Without it the portal keeps showing a member whose
    // cookie is already dead.
    localStorage.setItem("nexusfit_logged_member", JSON.stringify({ id: "m-1" }));
    const events: Event[] = [];
    const onExpired = (event: Event) => events.push(event);
    window.addEventListener(MEMBER_SESSION_EXPIRED_EVENT, onExpired);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: "Not authenticated" }),
      }))
    );

    try {
      render(<MemberSessionsCard onLogout={() => {}} onLogoutAll={() => {}} />);

      await waitFor(() => expect(events).toHaveLength(1));
      expect(localStorage.getItem("nexusfit_logged_member")).toBeNull();
    } finally {
      window.removeEventListener(MEMBER_SESSION_EXPIRED_EVENT, onExpired);
    }
  });

  it("reloads the list when the refresh button is pressed", async () => {
    const spy = mockSessions({ sessions: [CURRENT] });
    render(<MemberSessionsCard onLogout={() => {}} onLogoutAll={() => {}} />);

    await waitFor(() => expect(screen.getByText("iPhone / iPad")).toBeTruthy());
    const before = spy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Ανανέωση συνεδριών" }));

    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(before));
  });
});
