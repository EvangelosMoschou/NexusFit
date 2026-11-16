// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccessTab } from "@/components/admin/AccessTab";

const ALERT = {
  member_id: "m-1",
  member_code: "NX-8492",
  full_name: "Γιώργος Παπαδόπουλος",
  event_count: 4,
  last_event_at: "2026-02-01T18:30:00.000Z",
  event_types: ["duplicate_entry", "quick_reentry"],
};

const EVENT = {
  id: "ev-1",
  member_id: "m-1",
  member_code: "NX-8492",
  full_name: "Γιώργος Παπαδόπουλος",
  event_type: "duplicate_entry",
  details: { direction: "in" },
  created_at: "2026-02-01T18:30:00.000Z",
};

function mockAccess(reply: unknown, ok = true) {
  const spy = vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => reply }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccessTab (access-anomaly monitor)", () => {
  it("shows the configured detection window instead of a hardcoded one", async () => {
    // The threshold and the quick-re-entry window come from the server. If the
    // panel printed its own numbers, staff would read the wrong rule.
    mockAccess({
      success: true,
      alerts: [],
      recentEvents: [],
      windowDays: 14,
      quickReentryMinutes: 45,
    });
    render(<AccessTab />);

    await waitFor(() =>
      expect(
        screen.getByText(/περισσότερα από ένα επαναλαμβανόμενα\s+check-in σε 14 ημέρες/)
      ).toBeTruthy()
    );
    expect(screen.getByText(/μέσα σε 45 λεπτά/)).toBeTruthy();
  });

  it("lists an active alarm with the count and the human-readable event types", async () => {
    mockAccess({ success: true, alerts: [ALERT], recentEvents: [], windowDays: 7 });
    render(<AccessTab />);

    await waitFor(() => expect(screen.getByText("Ενεργά alarms (1)")).toBeTruthy());
    expect(screen.getByText("NX-8492")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    // Raw enum names ("duplicate_entry") are incomprehensible to front-desk
    // staff; they must be translated.
    expect(screen.getByText(/Διπλό check-in · Γρήγορη επανείσοδος/)).toBeTruthy();
    expect(screen.queryByText(/duplicate_entry/)).toBeNull();
  });

  it("says clearly when there is nothing to investigate", async () => {
    mockAccess({ success: true, alerts: [], recentEvents: [], windowDays: 7 });
    render(<AccessTab />);

    await waitFor(() =>
      expect(screen.getByText("Δεν υπάρχουν επαναλαμβανόμενες προσπάθειες πρόσβασης.")).toBeTruthy()
    );
    expect(screen.getByText("Δεν υπάρχουν καταγραφές.")).toBeTruthy();
  });

  it("renders the recent events with their direction", async () => {
    mockAccess({ success: true, alerts: [], recentEvents: [EVENT], windowDays: 7 });
    render(<AccessTab />);

    await waitFor(() => expect(screen.getByText("Διπλό check-in")).toBeTruthy());
    expect(screen.getByText(/· in/)).toBeTruthy();
  });

  it("surfaces the server's error above the panels", async () => {
    // A failed request must not look like a clean bill of health, so the error
    // banner is rendered BEFORE the (necessarily empty) alarm list. The empty
    // states are still shown underneath — that is the component's current
    // behaviour and this test pins it rather than wishing it away.
    mockAccess({ success: false, error: "Δεν επιτρέπεται η πρόσβαση." }, false);
    render(<AccessTab />);

    await waitFor(() => expect(screen.getByText("Δεν επιτρέπεται η πρόσβαση.")).toBeTruthy());
    const body = document.body.textContent ?? "";
    expect(body.indexOf("Δεν επιτρέπεται η πρόσβαση.")).toBeLessThan(
      body.indexOf("Ενεργά alarms (0)")
    );
  });

  it("reports a network failure rather than showing a reassuring empty list", async () => {
    // `res.json()` is inside the try, so a dead connection surfaces the
    // browser's message. It is not the friendliest copy, but the important
    // property is that a failed load is visible at all.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    render(<AccessTab />);

    await waitFor(() => expect(screen.getByText("Failed to fetch")).toBeTruthy());
    expect(screen.queryByText("Φόρτωση...")).toBeNull();
  });

  it("opens the flagged member's profile from the alarm", async () => {
    const spy = vi.fn(async (url: string) => {
      if (url.startsWith("/api/admin/access")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, alerts: [ALERT], recentEvents: [], windowDays: 7 }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          member: {
            id: "m-1",
            member_code: "NX-8492",
            full_name: "Γιώργος Παπαδόπουλος",
            email: "g@example.com",
            tier_name: "Πλήρες",
            has_ai_access: 1,
            subscription_status: "active",
            expires_at: "2026-12-31",
            created_at: "2025-01-04",
          },
          plans: [],
          visits: [],
        }),
      };
    });
    vi.stubGlobal("fetch", spy);
    render(<AccessTab />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Προφίλ/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Προφίλ/ }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Προφίλ μέλους" })).toBeTruthy());
    expect(spy.mock.calls.some(([url]) => url === "/api/admin/members?id=m-1")).toBe(true);
  });

  it("re-reads the monitor on demand", async () => {
    const spy = mockAccess({ success: true, alerts: [], recentEvents: [], windowDays: 7 });
    render(<AccessTab />);

    await waitFor(() => expect(screen.getByText(/Ενεργά alarms/)).toBeTruthy());
    const before = spy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Ανανέωση/ }));

    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(before));
  });
});
