// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemberCheckIn } from "@/components/MemberCheckIn";
import { MEMBER_SESSION_EXPIRED_EVENT } from "@/lib/memberFetch";

/** The GET that seeds the card. */
function stateReply(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    // The route always reports the resulting direction; the card derives
    // "am I inside?" from it, not from `inside` alone.
    status: "out",
    inside: false,
    since: null,
    locked: false,
    subscriptionActive: true,
    occupancy: { inside: 5, capacity: 80 },
    visits30d: 12,
    ...overrides,
  };
}

function mockVisit(get: unknown, post?: unknown, getOk = true) {
  const spy = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return { ok: true, status: 200, json: async () => post ?? get };
    }
    return { ok: getOk, status: getOk ? 200 : 500, json: async () => get };
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
  vi.useRealTimers();
  localStorage.clear();
});

describe("MemberCheckIn (the member's own check-in card)", () => {
  it("shows the live occupancy for a premium member who is not inside", async () => {
    mockVisit(stateReply());
    render(<MemberCheckIn />);

    await waitFor(() => expect(screen.getByText("Δεν έχεις δηλώσει είσοδο")).toBeTruthy());
    expect(screen.getByText(/5\/80 μέσα τώρα/)).toBeTruthy();
    expect(screen.getByText(/12 παρουσίες \(30 ημέρες\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Δήλωση εισόδου/ })).toBeTruthy();
  });

  it("checks the member in and switches the button to the check-out action", async () => {
    const spy = mockVisit(
      stateReply(),
      stateReply({
        status: "in",
        inside: true,
        since: "2026-01-01T18:00:00.000Z",
        visits30d: 13,
      })
    );
    render(<MemberCheckIn />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Δήλωση εισόδου/ })).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: /Δήλωση εισόδου/ }));

    await waitFor(() => expect(screen.getByText("Είσαι μέσα στο γυμναστήριο")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Τέλος προπόνησης/ })).toBeTruthy();
    // The POST carries the direction, and it is the one the old state implied.
    const post = spy.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ action: "in" });
  });

  it("checks the member out with the opposite action", async () => {
    const spy = mockVisit(
      stateReply({ status: "in", inside: true, since: "2026-01-01T18:00:00.000Z" }),
      stateReply({ status: "out", inside: false, since: null })
    );
    render(<MemberCheckIn />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Τέλος προπόνησης/ })).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: /Τέλος προπόνησης/ }));

    await waitFor(() => expect(screen.getByText("Δεν έχεις δηλώσει είσοδο")).toBeTruthy());
    const post = spy.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ action: "out" });
  });

  it("shows the local start time for a member who is inside, never the raw ISO string", async () => {
    mockVisit(stateReply({ status: "in", inside: true, since: "2026-01-01T18:00:00.000Z" }));
    render(<MemberCheckIn />);

    // The value is formatted in the runtime's locale, so assert the shape the
    // member reads (a HH:MM clock under el-GR, "08:00 μ.μ." when jsdom has no
    // Greek locale data) rather than a fixed string, and assert the machine
    // timestamp never reaches the screen.
    await waitFor(() => expect(screen.getByText(/Από τις \d{1,2}:\d{2}/)).toBeTruthy());
    expect(document.body.textContent).not.toContain("2026-01-01T18:00");
  });

  it("replaces the whole card with the upgrade notice for an inactive subscription", async () => {
    // The route answers subscriptionActive:false for an expired member. Showing
    // the check-in button anyway invites a click that can only fail.
    mockVisit(stateReply({ subscriptionActive: false, locked: true, occupancy: null }));
    render(<MemberCheckIn />);

    await waitFor(() => expect(screen.getByText("Η συνδρομή σου δεν είναι ενεργή")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Δήλωση εισόδου/ })).toBeNull();
  });

  it("does not offer check-in to a non-premium member but still lets them in", async () => {
    // `locked` only hides occupancy/forecast. Check-in itself must stay
    // available, or standard members could never record a visit.
    mockVisit(stateReply({ locked: true, occupancy: null }));
    render(<MemberCheckIn />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Δήλωση εισόδου/ })).toBeTruthy()
    );
    expect(screen.getByText(/διαθέσιμες με Premium/)).toBeTruthy();
    expect(screen.queryByText(/μέσα τώρα/)).toBeNull();
  });

  it("surfaces the server's error and keeps the member's state unchanged", async () => {
    mockVisit(
      stateReply(),
      { success: false, error: "Η πληρότητα είναι πλήρης αυτή τη στιγμή." },
      true
    );
    // The POST must fail here, so build the stub directly.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              success: false,
              error: "Η πληρότητα είναι πλήρης αυτή τη στιγμή.",
            }),
          };
        }
        return { ok: true, status: 200, json: async () => stateReply() };
      })
    );
    render(<MemberCheckIn />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Δήλωση εισόδου/ })).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: /Δήλωση εισόδου/ }));

    await waitFor(() =>
      expect(screen.getByText("Η πληρότητα είναι πλήρης αυτή τη στιγμή.")).toBeTruthy()
    );
    // The button still says "check in": the member was NOT checked in.
    expect(screen.getByRole("button", { name: /Δήλωση εισόδου/ })).toBeTruthy();
  });

  it("locks occupancy immediately when the server refuses with locked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              success: false,
              locked: true,
              subscriptionActive: true,
              error: "Απαιτείται Premium.",
            }),
          };
        }
        return { ok: true, status: 200, json: async () => stateReply() };
      })
    );
    render(<MemberCheckIn />);
    await waitFor(() => expect(screen.getByText(/5\/80 μέσα τώρα/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Δήλωση εισόδου/ }));

    // The stale occupancy is withdrawn as soon as the server says it is locked:
    // leaving "5/80" on screen would show premium data to a downgraded member.
    await waitFor(() => expect(screen.queryByText(/5\/80 μέσα τώρα/)).toBeNull());
  });

  it("renders the loading placeholder first, then the real card", async () => {
    mockVisit(stateReply());
    render(<MemberCheckIn />);

    expect(screen.getByText("Φόρτωση κατάστασης παρουσίας...")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Φόρτωση κατάστασης παρουσίας...")).toBeNull());
  });

  it("keeps the normal card when the initial GET fails", async () => {
    // The subscription flag used to default to `false`, so a 500 from
    // /api/member/visit rendered the "Η συνδρομή σου δεν είναι ενεργή" upgrade
    // notice to a member whose subscription is perfectly active. A transient
    // server error must not assert something about the member's contract: fall
    // back to the ordinary card and let the next read settle it.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ success: false }) }))
    );
    render(<MemberCheckIn />);

    await waitFor(() => expect(screen.queryByText("Φόρτωση κατάστασης παρουσίας...")).toBeNull());
    expect(screen.queryByText("Η συνδρομή σου δεν είναι ενεργή")).toBeNull();
    expect(screen.getByText("Δεν έχεις δηλώσει είσοδο")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Δήλωση εισόδου/ })).toBeTruthy();
  });

  it("still shows the upgrade notice when the server explicitly says it is inactive", async () => {
    // The `null` fallback must not weaken the real signal: an explicit
    // subscriptionActive:false still replaces the card, so the fix above is a
    // genuine distinction and not a blanket suppression of the notice.
    mockVisit(stateReply({ subscriptionActive: false, locked: true, occupancy: null }));
    render(<MemberCheckIn />);

    await waitFor(() => expect(screen.getByText("Η συνδρομή σου δεν είναι ενεργή")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Δήλωση εισόδου/ })).toBeNull();
  });

  it("clears the member session when the status read comes back 401", async () => {
    // A revoked session must not keep a member's card mounted as if logged in.
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
      render(<MemberCheckIn />);
      await waitFor(() => expect(events).toHaveLength(1));
      expect(localStorage.getItem("nexusfit_logged_member")).toBeNull();
    } finally {
      window.removeEventListener(MEMBER_SESSION_EXPIRED_EVENT, onExpired);
    }
  });
});
