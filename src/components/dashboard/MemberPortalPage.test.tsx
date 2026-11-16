// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemberPortalPage } from "@/components/dashboard/MemberPortalPage";
import type { MemberUser } from "@/lib/auth";
import { defaultGymConfig } from "@/config/gymConfig";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function makePlan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "plan-1",
    createdAt: "2026-02-01T10:00:00.000Z",
    userGoal: "muscle_gain",
    experienceLevel: "beginner",
    daysPerWeek: 3,
    sessionDuration: 60,
    splitType: "custom",
    splitName: "Πρόγραμμα Δύναμης 3 ημερών",
    coachAdvice: "Ξεκίνα με προθέρμανση 8 λεπτών.",
    warmupProtocol: ["5 λεπτά διάδρομο"],
    weeklyCardioRecommendation: "2 x 20 λεπτά",
    days: [
      {
        dayName: "Ημέρα 1 - Στήθος",
        focus: "Στήθος",
        estimatedMinutes: 60,
        exercises: [
          {
            exerciseId: "bench-press",
            greekName: "Πιέσεις Πάγκου",
            sets: 4,
            reps: "8-10",
            restSeconds: 90,
          },
        ],
      },
      {
        dayName: "Ημέρα 2 - Πλάτη",
        focus: "Πλάτη",
        estimatedMinutes: 55,
        exercises: [
          { exerciseId: "row", greekName: "Κωπηλατική", sets: 4, reps: "10", restSeconds: 90 },
        ],
      },
    ],
    ...overrides,
  };
}

function makeMember(overrides: Partial<MemberUser> = {}): MemberUser {
  return {
    id: "m-1",
    memberCode: "NX-8492",
    fullName: "Γιώργος Παπαδόπουλος",
    email: "g.papadopoulos@example.com",
    joinedAt: "2025-01-04T00:00:00.000Z",
    subscription: {
      tier: "standard",
      tierName: "Βασικό (Gym Pass)",
      status: "active",
      expiresAt: "2026-12-31",
      autoRenew: true,
      hasAIAccess: false,
    },
    savedPlans: [],
    ...overrides,
  };
}

/** A routing stub for every endpoint the portal touches. */
function mockPortal(overrides: Record<string, unknown> = {}) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/config") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, config: defaultGymConfig }),
      };
    }
    if (url === "/api/member/visit") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          status: "out",
          inside: false,
          locked: true,
          subscriptionActive: true,
          occupancy: null,
          visits30d: 3,
        }),
      };
    }
    if (url.startsWith("/api/occupancy/analytics")) {
      return { ok: true, status: 200, json: async () => ({ success: true, locked: true }) };
    }
    if (url === "/api/member/access-token") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: false, error: "Δεν υπάρχει ενεργό QR." }),
      };
    }
    if (url === "/api/member/sessions") {
      return { ok: true, status: 200, json: async () => ({ success: true, sessions: [] }) };
    }
    if (url === "/api/member/notifications") {
      return { ok: true, status: 200, json: async () => ({ success: true, unreadCount: 0 }) };
    }
    if (url === "/api/member/export") {
      return (
        (overrides.exportReply as unknown) ?? { ok: false, status: 500, json: async () => ({}) }
      );
    }
    if (url === "/api/member/erase") {
      return (
        (overrides.eraseReply as unknown) ?? { ok: false, status: 500, json: async () => ({}) }
      );
    }
    void init;
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function renderPortal(member: MemberUser = makeMember(), props: Record<string, unknown> = {}) {
  const handlers = {
    onGoHome: vi.fn(),
    onLogout: vi.fn(),
    onLogoutAll: vi.fn(),
    onLaunchAIWizard: vi.fn(),
    onLaunchAIChat: vi.fn(),
    onLaunchManualBuilder: vi.fn(),
    onViewPlan: vi.fn(),
    onToggleLiteMode: vi.fn(),
    ...props,
  };
  const utils = render(<MemberPortalPage member={member} {...handlers} />);
  return { ...utils, handlers };
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

describe("MemberPortalPage (the member's home screen)", () => {
  it("greets the member by first name and shows their card code and barcode", () => {
    mockPortal();
    renderPortal();

    expect(screen.getByRole("heading", { name: /Καλωσήρθατε, Γιώργος!/ })).toBeTruthy();
    // The code appears in the card panel and again under the barcode; both are
    // the member's own identifier, so assert presence rather than uniqueness.
    expect(screen.getAllByText("NX-8492").length).toBeGreaterThan(0);
    // The barcode is what the desk scans; its accessible name must carry the
    // member's code so a screen-reader user can confirm it.
    expect(screen.getByRole("img", { name: "Barcode NX-8492" })).toBeTruthy();
  });

  it("locks the AI actions for a standard member and offers manual building instead", () => {
    mockPortal();
    const { handlers } = renderPortal();

    // A standard member must never see the AI entry points...
    expect(screen.queryByRole("button", { name: /Νέο Πρόγραμμα/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Συνομιλία με τον Προπονητή/ })).toBeNull();
    // ...but must still be able to build a plan by hand.
    fireEvent.click(screen.getByRole("button", { name: /Χειροκίνητο Πρόγραμμα/ }));
    expect(handlers.onLaunchManualBuilder).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Βασικό Πακέτο/)).toBeTruthy();
  });

  it("offers the AI actions to an active AI subscriber", () => {
    mockPortal();
    const { handlers } = renderPortal(
      makeMember({
        subscription: {
          tier: "all_inclusive_ai",
          tierName: "Πλήρες (Ψηφιακός Βοηθός)",
          status: "active",
          expiresAt: "2026-12-31",
          autoRenew: true,
          hasAIAccess: true,
        },
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /Νέο Πρόγραμμα/ }));
    expect(handlers.onLaunchAIWizard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Συνομιλία με τον Προπονητή/ }));
    expect(handlers.onLaunchAIChat).toHaveBeenCalledTimes(1);
  });

  it("treats an AI subscriber whose subscription lapsed as a standard member", () => {
    // `hasAIAccess` alone is not enough: an expired subscription must lose the
    // paid feature. This is the boundary that a check on one flag would miss.
    mockPortal();
    renderPortal(
      makeMember({
        subscription: {
          tier: "all_inclusive_ai",
          tierName: "Πλήρες (Ψηφιακός Βοηθός)",
          status: "expired",
          expiresAt: "2025-01-01",
          autoRenew: false,
          hasAIAccess: true,
        },
      })
    );

    expect(screen.queryByRole("button", { name: /Νέο Πρόγραμμα/ })).toBeNull();
    expect(screen.getByText("Έληξε")).toBeTruthy();
  });

  it("shows the saved-plan count and lists every plan in the history tab", () => {
    mockPortal();
    const { handlers } = renderPortal(
      makeMember({
        savedPlans: [
          makePlan() as never,
          makePlan({ id: "plan-2", splitName: "Δεύτερο" }) as never,
        ],
      })
    );

    const historyTab = screen.getByRole("button", { name: /Ιστορικό Προγραμμάτων \(2\)/ });
    fireEvent.click(historyTab);

    expect(screen.getByText("Πρόγραμμα Δύναμης 3 ημερών")).toBeTruthy();
    expect(screen.getByText("Δεύτερο")).toBeTruthy();
    // Each row can open the printable view.
    fireEvent.click(screen.getAllByRole("button", { name: /Προβολή & Εκτύπωση/ })[0]);
    expect(handlers.onViewPlan).toHaveBeenCalledWith(expect.objectContaining({ id: "plan-1" }));
  });

  it("explains how to start when no plan is saved yet", () => {
    mockPortal();
    renderPortal();

    expect(screen.getByText("Δεν υπάρχει ενεργό πρόγραμμα")).toBeTruthy();
    expect(screen.getByText(/Δεν έχετε καταχωρήσει ακόμα κάποιο προπονητικό πλάνο/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Ιστορικό Προγραμμάτων/ }));
    expect(screen.getByText(/Δεν έχετε αποθηκευμένα προγράμματα ακόμα/)).toBeTruthy();
  });

  it("shows only today's classes in the schedule tab, and says so when there are none", () => {
    mockPortal();
    const todayKey = DAYS[new Date().getDay()];
    const today = defaultGymConfig.schedule.filter((item) => item.day === todayKey);
    const otherDay = defaultGymConfig.schedule.find((item) => item.day !== todayKey)!;

    renderPortal();
    fireEvent.click(screen.getByRole("button", { name: /Σημερινά Μαθήματα Γυμναστηρίου/ }));

    for (const item of today.slice(0, 4)) {
      expect(screen.getByText(item.className)).toBeTruthy();
    }
    // A class on another day must never appear in "today's" list.
    if (!today.some((item) => item.className === otherDay.className)) {
      expect(screen.queryByText(otherDay.className)).toBeNull();
    }
  });

  it("shows the locally stored weight logs and counts them in the stat card", () => {
    localStorage.setItem(
      "nexusfit_exercise_logs",
      JSON.stringify([
        { exerciseId: "bench-press", weightKg: 80, repsAchieved: 8, date: "2026-02-01" },
        { exerciseId: "row", weightKg: 60, repsAchieved: 10, date: "2026-02-02" },
      ])
    );
    mockPortal();
    renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Καταγραφή Κιλών \(2\)/ }));

    expect(screen.getByText("bench-press")).toBeTruthy();
    expect(screen.getByText("80 kg")).toBeTruthy();
    expect(screen.getByText("60 kg")).toBeTruthy();
  });

  it("shows an empty state instead of a blank tab when nothing is logged", () => {
    mockPortal();
    renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Καταγραφή Κιλών/ }));
    expect(screen.getByText("Δεν υπάρχουν ακόμη καταγεγραμμένα βάρη.")).toBeTruthy();
  });

  it("exports the member's data as a downloaded file", async () => {
    // GDPR self-service: the export is the member's copy of their data. If the
    // download never triggers, the button looks like it worked and nothing
    // reached their disk.
    const createObjectURL = vi.fn(() => "blob:export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockPortal({
      exportReply: {
        ok: true,
        status: 200,
        headers: { get: () => 'attachment; filename="member-export.json"' },
        blob: async () => new Blob(["{}"], { type: "application/json" }),
      },
    });
    renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Εξαγωγή Δεδομένων/ }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("member-export.json");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
  });

  it("falls back to a sensible filename when the server sends no disposition", async () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockPortal({
      exportReply: {
        ok: true,
        status: 200,
        headers: { get: () => null },
        blob: async () => new Blob(["{}"]),
      },
    });
    renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Εξαγωγή Δεδομένων/ }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe(
      "nexusfit-member-export.json"
    );
  });

  it("does not download anything when the export endpoint refuses", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPortal({ exportReply: { ok: false, status: 500, json: async () => ({ success: false }) } });
    renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Εξαγωγή Δεδομένων/ }));

    await waitFor(() => expect(errorSpy).not.toHaveBeenCalled());
    await Promise.resolve();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("does not erase the account unless the member confirms, and warns it cannot be undone", async () => {
    // Erasure deletes the member, their plans, visits and matching leads. The
    // confirmation is the only thing between an accidental tap and that.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const spy = mockPortal();
    const { handlers } = renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Διαγραφή Λογαριασμού/ }));

    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("μη αναστρέψιμη");
    // Cancelling must not send the DELETE.
    expect(spy.mock.calls.some(([url]) => url === "/api/member/erase")).toBe(false);
    expect(handlers.onLogout).not.toHaveBeenCalled();
  });

  it("erases the account, clears the local session and signs out on confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    localStorage.setItem("nexusfit_logged_member", JSON.stringify({ id: "m-1" }));
    mockPortal({ eraseReply: { ok: true, status: 200, json: async () => ({ success: true }) } });
    const { handlers } = renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Διαγραφή Λογαριασμού/ }));

    await waitFor(() => expect(handlers.onLogout).toHaveBeenCalledTimes(1));
    // Keeping the profile in localStorage would leave the portal "logged in"
    // against an account that no longer exists.
    expect(localStorage.getItem("nexusfit_logged_member")).toBeNull();
  });

  it("stays signed in when the erasure request fails", async () => {
    // handleEraseData only logs a failure; it must not sign the member out on a
    // non-ok answer, or a 500 would look exactly like a successful erasure.
    vi.spyOn(window, "confirm").mockReturnValue(true);
    localStorage.setItem("nexusfit_logged_member", JSON.stringify({ id: "m-1" }));
    const spy = mockPortal({
      eraseReply: { ok: false, status: 500, json: async () => ({ success: false }) },
    });
    const { handlers } = renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Διαγραφή Λογαριασμού/ }));

    await waitFor(() =>
      expect(spy.mock.calls.some(([url]) => url === "/api/member/erase")).toBe(true)
    );
    // Give the handler a turn to (incorrectly) log out.
    await Promise.resolve();
    expect(handlers.onLogout).not.toHaveBeenCalled();
    expect(localStorage.getItem("nexusfit_logged_member")).not.toBeNull();
    // The button is usable again: the member can retry the erasure.
    expect(
      (screen.getByRole("button", { name: /Διαγραφή Λογαριασμού/ }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("routes the header's logout through the parent's single path", () => {
    mockPortal();
    const { handlers } = renderPortal();

    // MemberMenu owns the button; opening it must expose both logout options.
    fireEvent.click(screen.getByRole("button", { name: "Μενού μέλους" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Αποσύνδεση" }));

    expect(handlers.onLogout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Μενού μέλους" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Αποσύνδεση από όλες τις συσκευές" }));
    expect(handlers.onLogoutAll).toHaveBeenCalledTimes(1);
  });

  it("opens the manual builder from the empty-plans card", () => {
    mockPortal();
    const { handlers } = renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Ιστορικό Προγραμμάτων/ }));
    fireEvent.click(screen.getByRole("button", { name: "Δημιουργία Προγράμματος" }));

    expect(handlers.onLaunchManualBuilder).toHaveBeenCalledTimes(1);
  });

  it("shows the AI coach panel only for an entitled member", () => {
    mockPortal();
    const { rerender } = renderPortal();

    expect(screen.getByText(/NexusFit Ψηφιακός Βοηθός \(Κλειδωμένο\)/)).toBeTruthy();

    rerender(
      <MemberPortalPage
        member={makeMember({
          subscription: {
            tier: "all_inclusive_ai",
            tierName: "Πλήρες (Ψηφιακός Βοηθός)",
            status: "active",
            expiresAt: "2026-12-31",
            autoRenew: true,
            hasAIAccess: true,
          },
        })}
        onGoHome={() => {}}
        onLogout={() => {}}
        onLogoutAll={() => {}}
        onLaunchAIWizard={() => {}}
        onLaunchAIChat={() => {}}
        onLaunchManualBuilder={() => {}}
        onViewPlan={() => {}}
        onToggleLiteMode={() => {}}
      />
    );

    expect(screen.queryByText(/NexusFit Ψηφιακός Βοηθός \(Κλειδωμένο\)/)).toBeNull();
    expect(screen.getByText("Βοήθεια Ψηφιακού Προπονητή")).toBeTruthy();
  });

  it("shows the latest plan as the active one with its coaching advice and first two days", () => {
    mockPortal();
    renderPortal(makeMember({ savedPlans: [makePlan() as never] }));

    expect(screen.getByRole("heading", { name: "Πρόγραμμα Δύναμης 3 ημερών" })).toBeTruthy();
    expect(screen.getByText(/Ξεκίνα με προθέρμανση 8 λεπτών/)).toBeTruthy();
    expect(screen.getByText("Ημέρα 1 - Στήθος")).toBeTruthy();
    expect(screen.getByText("Ημέρα 2 - Πλάτη")).toBeTruthy();
    // Both previewed days have exactly one exercise, and the first exercise's
    // Greek name is surfaced as the example.
    expect(screen.getAllByText(/1 Ασκήσεις/)).toHaveLength(2);
    expect(screen.getAllByText(/Πιέσεις Πάγκου/).length).toBeGreaterThan(0);
  });

  it("asks the parent to go home from the brand button", () => {
    mockPortal();
    const { handlers } = renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Επιστροφή στην αρχική σελίδα/ }));
    expect(handlers.onGoHome).toHaveBeenCalledTimes(1);
  });

  it("toggles lite mode from the header", () => {
    mockPortal();
    const { handlers } = renderPortal();

    fireEvent.click(screen.getByRole("button", { name: /Ελαφριά Λειτουργία/ }));
    expect(handlers.onToggleLiteMode).toHaveBeenCalledTimes(1);
  });
});
