// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StaffTab } from "@/components/admin/StaffTab";

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: "admin" | "trainer";
  permissions: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

function staff(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    id: "st-1",
    name: "Νίκος Γυμναστής",
    email: "nikos@nexusathletics.gr",
    role: "trainer",
    permissions: ["members_view", "occupancy_view", "occupancy_manage"],
    active: true,
    created_at: "2025-06-01T09:00:00.000Z",
    updated_at: "2025-06-01T09:00:00.000Z",
    last_login_at: "2026-02-01T08:15:00.000Z",
    ...overrides,
  };
}

/** Routes by method: GET list, POST create, PATCH update, DELETE remove. */
function mockStaff(rows: StaffRow[], overrides: Record<string, unknown> = {}) {
  const spy = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return (
        (overrides.post as unknown) ?? {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        }
      );
    }
    if (init?.method === "PATCH") {
      return (
        (overrides.patch as unknown) ?? {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        }
      );
    }
    if (init?.method === "DELETE") {
      return (
        (overrides.delete as unknown) ?? {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        }
      );
    }
    return {
      ok: (overrides.listOk as boolean) ?? true,
      status: (overrides.listOk as boolean) === false ? 500 : 200,
      json: async () => (overrides.list as unknown) ?? { success: true, staff: rows },
    };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("StaffTab (staff accounts and permissions)", () => {
  it("lists each account with its role, state and last login", async () => {
    mockStaff([
      staff(),
      staff({
        id: "st-2",
        name: "Άννα Admin",
        email: "anna@x.gr",
        role: "admin",
        permissions: [],
        last_login_at: null,
      }),
    ]);
    render(<StaffTab />);

    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());
    // Roles must be legible, not the raw enum. The create form's <select> also
    // has "Γυμναστής", so scope the assertion to the account cards.
    const trainerCard = screen
      .getByText("Νίκος Γυμναστής")
      .closest("div.rounded-xl") as HTMLElement;
    const adminCard = screen.getByText("Άννα Admin").closest("div.rounded-xl") as HTMLElement;
    expect(within(trainerCard).getByText("Γυμναστής")).toBeTruthy();
    expect(within(adminCard).getByText("Διαχειριστής")).toBeTruthy();
    expect(screen.getAllByText("Ενεργός").length).toBeGreaterThan(0);
    // Both cards render a last-login line; the never-logged-in case must show
    // the em dash rather than "Invalid Date".
    expect(within(trainerCard).getByText(/Τελευταία σύνδεση:/)).toBeTruthy();
    expect(within(adminCard).getByText(/Τελευταία σύνδεση: —/)).toBeTruthy();
    // An admin's permissions are implicit, not a checklist.
    expect(screen.getByText("Πλήρης πρόσβαση διαχειριστή")).toBeTruthy();
  });

  it("shows the permission checkboxes only for a trainer, and exactly the granted ones", async () => {
    mockStaff([staff()]);
    render(<StaffTab />);

    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    const card = screen.getByText("Νίκος Γυμναστής").closest("div.rounded-xl") as HTMLElement;
    // A permission the trainer does not have must render UNCHECKED: a wrong
    // default here grants access the owner never approved.
    const announcements = within(card).getByRole("checkbox", { name: /Διαχείριση ανακοινώσεων/ });
    expect((announcements as HTMLInputElement).checked).toBe(false);
    const membersView = within(card).getByRole("checkbox", { name: /Προβολή μελών/ });
    expect((membersView as HTMLInputElement).checked).toBe(true);
  });

  it("creates a trainer and clears the form afterwards", async () => {
    const spy = mockStaff([], { list: { success: true, staff: [] } });
    render(<StaffTab />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Δεν υπάρχουν λογαριασμοί προσωπικού. Ο κύριος κωδικός ADMIN_PASSWORD λειτουργεί πάντα ως εφεδρικός owner."
        )
      ).toBeTruthy()
    );

    const nameInput = document.querySelector(
      "form input[required]:not([type])"
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Νέος Γυμναστής" } });
    fireEvent.change(document.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: "new@nexusathletics.gr" },
    });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "supersecret1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/ }));

    await waitFor(() =>
      expect(spy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true)
    );
    const post = spy.mock.calls.find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse(String((post[1] as RequestInit).body));
    expect(body).toMatchObject({
      name: "Νέος Γυμναστής",
      email: "new@nexusathletics.gr",
      role: "trainer",
      password: "supersecret1",
    });
    // A trainer is created with the default permission set, never with an empty
    // one (which would produce an account that can do nothing).
    expect(body.permissions).toEqual(["members_view", "occupancy_view", "occupancy_manage"]);

    await waitFor(() => expect(screen.getByText("Ο λογαριασμός δημιουργήθηκε.")).toBeTruthy());
    // The password is not left sitting in the DOM after a successful create.
    expect((document.querySelector('input[type="password"]') as HTMLInputElement).value).toBe("");
  });

  it("sends no permissions for an admin account", async () => {
    const spy = mockStaff([]);
    render(<StaffTab />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/ })).toBeTruthy()
    );
    fireEvent.change(
      document.querySelector("form input[required]:not([type])") as HTMLInputElement,
      {
        target: { value: "Δεύτερος Admin" },
      }
    );
    fireEvent.change(document.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: "admin2@x.gr" },
    });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "anothersecret" },
    });
    fireEvent.change(document.querySelector("select") as HTMLSelectElement, {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/ }));

    await waitFor(() =>
      expect(spy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true)
    );
    const body = JSON.parse(
      String((spy.mock.calls.find(([, init]) => init?.method === "POST")![1] as RequestInit).body)
    );
    // An admin holds every permission implicitly; sending a stale trainer list
    // would persist permissions that are meaningless for the role.
    expect(body.role).toBe("admin");
    expect(body.permissions).toEqual([]);
  });

  it("reports a rejected account creation instead of silently doing nothing", async () => {
    mockStaff([], {
      post: {
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: "Το email χρησιμοποιείται ήδη." }),
      },
    });
    render(<StaffTab />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/ })).toBeTruthy()
    );
    fireEvent.change(
      document.querySelector("form input[required]:not([type])") as HTMLInputElement,
      {
        target: { value: "Διπλό" },
      }
    );
    fireEvent.change(document.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: "dup@x.gr" },
    });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "supersecret1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/ }));

    await waitFor(() => expect(screen.getByText("Το email χρησιμοποιείται ήδη.")).toBeTruthy());
    // The typed values are kept so the admin can correct one field.
    expect((document.querySelector('input[type="email"]') as HTMLInputElement).value).toBe(
      "dup@x.gr"
    );
  });

  it("grants occupancy_view automatically when occupancy_manage is ticked", async () => {
    // Managing check-ins without being able to see occupancy is a permission
    // combination the server normalises too; the UI must not send it.
    const spy = mockStaff([staff({ permissions: ["members_view"] })]);
    render(<StaffTab />);
    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    const card = screen.getByText("Νίκος Γυμναστής").closest("div.rounded-xl") as HTMLElement;
    fireEvent.click(within(card).getByRole("checkbox", { name: /Check-in \/ check-out/ }));
    // The implied view permission is reflected in the UI immediately.
    expect(
      (within(card).getByRole("checkbox", { name: /Προβολή παρουσιών/ }) as HTMLInputElement)
        .checked
    ).toBe(true);

    fireEvent.click(within(card).getByRole("button", { name: /Αποθήκευση/ }));

    await waitFor(() =>
      expect(spy.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true)
    );
    const body = JSON.parse(
      String((spy.mock.calls.find(([, init]) => init?.method === "PATCH")![1] as RequestInit).body)
    );
    expect(body.permissions).toEqual(
      expect.arrayContaining(["members_view", "occupancy_view", "occupancy_manage"])
    );
  });

  it("saves the active flag together with the permissions", async () => {
    const spy = mockStaff([staff()]);
    render(<StaffTab />);
    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    const card = screen.getByText("Νίκος Γυμναστής").closest("div.rounded-xl") as HTMLElement;
    // Deactivating is the soft way to revoke access; it must reach the server.
    fireEvent.click(within(card).getByRole("checkbox", { name: "Ενεργός" }));
    fireEvent.click(within(card).getByRole("button", { name: /Αποθήκευση/ }));

    await waitFor(() =>
      expect(spy.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true)
    );
    const body = JSON.parse(
      String((spy.mock.calls.find(([, init]) => init?.method === "PATCH")![1] as RequestInit).body)
    );
    expect(body.active).toBe(false);
    expect(body.id).toBe("st-1");
  });

  it("keeps the password-change button disabled until 8 characters are typed", async () => {
    mockStaff([staff()]);
    render(<StaffTab />);
    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    const fill = document.querySelector(
      'input[placeholder="Νέος κωδικός (8+)"]'
    ) as HTMLInputElement;
    const change = screen.getByRole("button", { name: "Αλλαγή" });

    expect((change as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(fill, { target: { value: "1234567" } });
    expect((change as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(fill, { target: { value: "12345678" } });
    expect((change as HTMLButtonElement).disabled).toBe(false);
  });

  it("changes a password and tells the admin the old sessions are gone", async () => {
    const spy = mockStaff([staff()]);
    render(<StaffTab />);
    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    fireEvent.change(
      document.querySelector('input[placeholder="Νέος κωδικός (8+)"]') as HTMLInputElement,
      {
        target: { value: "brandnewpass" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Αλλαγή" }));

    await waitFor(() =>
      expect(screen.getByText("Ο κωδικός άλλαξε. Οι παλιές συνεδρίες ακυρώθηκαν.")).toBeTruthy()
    );
    const body = JSON.parse(
      String((spy.mock.calls.find(([, init]) => init?.method === "PATCH")![1] as RequestInit).body)
    );
    expect(body).toEqual({ id: "st-1", password: "brandnewpass" });
  });

  it("refuses a short password without calling the server", async () => {
    const spy = mockStaff([staff()]);
    render(<StaffTab />);
    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    // The button is disabled, but the handler's own guard is the real gate: a
    // 4-character password would be accepted by a weaker server policy.
    fireEvent.change(
      document.querySelector('input[placeholder="Νέος κωδικός (8+)"]') as HTMLInputElement,
      {
        target: { value: "1234" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Αλλαγή" }));

    await Promise.resolve();
    expect(spy.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("deletes an account only after the irreversible-deletion warning is accepted", async () => {
    const spy = mockStaff([staff()]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<StaffTab />);
    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Οριστική διαγραφή \(GDPR\)/ }));

    const message = confirmSpy.mock.calls[0][0] as string;
    // The warning must name the account and say the audit trail is kept but
    // anonymised — that is what the operator is agreeing to.
    expect(message).toContain("Νίκος Γυμναστής");
    expect(message).toContain("nikos@nexusathletics.gr");
    expect(message).toContain("GDPR");
    expect(message).toContain("ανωνυμοποιηθεί");

    await waitFor(() =>
      expect(spy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
    );
    const del = spy.mock.calls.find(([, init]) => init?.method === "DELETE")!;
    expect(del[0]).toBe("/api/admin/staff?id=st-1");
    await waitFor(() =>
      expect(screen.getByText("Ο λογαριασμός διαγράφηκε οριστικά.")).toBeTruthy()
    );
  });

  it("does not delete anything when the confirmation is dismissed", async () => {
    const spy = mockStaff([staff()]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<StaffTab />);
    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Οριστική διαγραφή \(GDPR\)/ }));

    await Promise.resolve();
    expect(spy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy();
  });

  it("keeps the account visible when the deletion is refused", async () => {
    mockStaff([staff()], {
      delete: {
        ok: false,
        status: 409,
        json: async () => ({ success: false, error: "Δεν μπορείτε να διαγράψετε τον εαυτό σας." }),
      },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<StaffTab />);
    await waitFor(() => expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Οριστική διαγραφή \(GDPR\)/ }));

    await waitFor(() =>
      expect(screen.getByText("Δεν μπορείτε να διαγράψετε τον εαυτό σας.")).toBeTruthy()
    );
    // A failed delete must not remove the row: the operator would believe an
    // account with live permissions is gone.
    expect(screen.getByText("Νίκος Γυμναστής")).toBeTruthy();
    expect(screen.queryByText("Ο λογαριασμός διαγράφηκε οριστικά.")).toBeNull();
  });

  it("explains the empty state, including the ADMIN_PASSWORD fallback", async () => {
    mockStaff([], { list: { success: true, staff: [] } });
    render(<StaffTab />);

    await waitFor(() =>
      expect(
        screen.getByText(/Δεν υπάρχουν λογαριασμοί προσωπικού\. Ο κύριος κωδικός ADMIN_PASSWORD/)
      ).toBeTruthy()
    );
  });

  it("reports a failed list instead of pretending there are no accounts", async () => {
    mockStaff([], { listOk: false });
    render(<StaffTab />);

    await waitFor(() =>
      expect(screen.getByText("Δεν ήταν δυνατή η φόρτωση των λογαριασμών.")).toBeTruthy()
    );
  });
});
