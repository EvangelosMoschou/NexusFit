// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MembersTab, type MemberItem } from "@/components/admin/MembersTab";

function member(overrides: Partial<MemberItem> = {}): MemberItem {
  return {
    id: "m-1",
    member_code: "NX-8492",
    full_name: "Γιώργος Παπαδόπουλος",
    email: "g.papadopoulos@example.com",
    tier_name: "Πλήρες Μέλος",
    has_ai_access: 1,
    subscription_status: "active",
    expires_at: "2026-12-31",
    created_at: "2025-01-04",
    ...overrides,
  };
}

/** The create endpoint answers with the envelope apiClient normalises. */
type FetchMock = (url: string, init?: RequestInit) => Promise<unknown>;

function mockCreate(reply: { ok: boolean; status: number; body: unknown }) {
  const spy = vi.fn<FetchMock>(async () => ({
    ok: reply.ok,
    status: reply.status,
    json: async () => reply.body,
  }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function fillForm(values: { code: string; name: string; email: string; pin?: string }) {
  fireEvent.change(screen.getByPlaceholderText("π.χ. NX-9921"), {
    target: { value: values.code },
  });
  fireEvent.change(screen.getByPlaceholderText("π.χ. Κωνσταντίνος Νικολάου"), {
    target: { value: values.name },
  });
  fireEvent.change(screen.getByPlaceholderText("member@example.com"), {
    target: { value: values.email },
  });
  if (values.pin !== undefined) {
    fireEvent.change(screen.getByLabelText("PIN Σύνδεσης (4 ψηφία)"), {
      target: { value: values.pin },
    });
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MembersTab (admin member CRUD)", () => {
  it("renders every member with their AI entitlement spelled out", () => {
    const ai = member();
    const basic = member({
      id: "m-2",
      member_code: "NX-3109",
      full_name: "Μαρία Κωνσταντίνου",
      has_ai_access: 0,
    });
    render(<MembersTab members={[ai, basic]} onRefresh={() => {}} onDelete={() => {}} />);

    expect(screen.getByText("Γιώργος Παπαδόπουλος")).toBeTruthy();
    expect(screen.getByText("Μαρία Κωνσταντίνου")).toBeTruthy();
    // The paid add-on must be visually distinguishable, not an opaque 1/0.
    expect(screen.getByText("Ψηφιακός Βοηθός")).toBeTruthy();
    expect(screen.getByText("Βασικό Πακέτο")).toBeTruthy();
  });

  it("filters by name, card code or email as the admin types", () => {
    render(
      <MembersTab
        members={[
          member(),
          member({
            id: "m-2",
            member_code: "NX-3109",
            full_name: "Μαρία Κωνσταντίνου",
            email: "m.konstantinou@example.com",
          }),
        ]}
        onRefresh={() => {}}
        onDelete={() => {}}
      />
    );

    const search = screen.getByLabelText("Αναζήτηση μέλους");

    fireEvent.change(search, { target: { value: "μαρία" } });
    expect(screen.queryByText("Γιώργος Παπαδόπουλος")).toBeNull();
    expect(screen.getByText("Μαρία Κωνσταντίνου")).toBeTruthy();

    // The match is case-insensitive and covers the card code too.
    fireEvent.change(search, { target: { value: "nx-8492" } });
    expect(screen.getByText("Γιώργος Παπαδόπουλος")).toBeTruthy();
    expect(screen.queryByText("Μαρία Κωνσταντίνου")).toBeNull();

    fireEvent.change(search, { target: { value: "konstantinou@example" } });
    expect(screen.getByText("Μαρία Κωνσταντίνου")).toBeTruthy();
  });

  it("tells the admin when a search matches nothing", () => {
    render(<MembersTab members={[member()]} onRefresh={() => {}} onDelete={() => {}} />);

    fireEvent.change(screen.getByLabelText("Αναζήτηση μέλους"), {
      target: { value: "δεν-υπάρχει" },
    });

    expect(screen.getByText("Δεν βρέθηκαν μέλη για αυτή την αναζήτηση.")).toBeTruthy();
  });

  it("creates a member, refreshes the list and clears the form", async () => {
    const spy = mockCreate({ ok: true, status: 200, body: { success: true } });
    const onRefresh = vi.fn();
    render(<MembersTab members={[]} onRefresh={onRefresh} onDelete={() => {}} />);

    fillForm({ code: "NX-9921", name: "Κωνσταντίνος Νικολάου", email: "k@example.com" });
    fireEvent.click(screen.getByRole("button", { name: /Αποθήκευση & Έκδοση Μέλους/ }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/admin/members");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.member).toMatchObject({
      memberCode: "NX-9921",
      fullName: "Κωνσταντίνος Νικολάου",
      email: "k@example.com",
      hasAIAccess: true,
      subscriptionStatus: "active",
    });
    // The AI add-on is on by default, so its price must be opt-out-able.
    const checkbox = screen.getByRole("checkbox", { name: /Ενεργοποίηση Ψηφιακού Βοηθού/ });
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    // A cleared form is the only signal that the member now exists: leaving the
    // typed values would make a double-click issue two cards.
    expect((screen.getByPlaceholderText("π.χ. NX-9921") as HTMLInputElement).value).toBe("");
  });

  it("sends hasAIAccess:false when the admin unticks the add-on", async () => {
    const spy = mockCreate({ ok: true, status: 200, body: { success: true } });
    render(<MembersTab members={[]} onRefresh={() => {}} onDelete={() => {}} />);

    fillForm({ code: "NX-1", name: "Α Β", email: "a@example.com" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Ενεργοποίηση Ψηφιακού Βοηθού/ }));
    fireEvent.click(screen.getByRole("button", { name: /Αποθήκευση & Έκδοση Μέλους/ }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).member.hasAIAccess).toBe(
      false
    );
  });

  it("shows a retry-worthy error and keeps the form when the save is rejected", async () => {
    // A duplicate barcode or a malformed PIN is rejected with 400. The old
    // behaviour swallowed it and looked like nothing happened, so the admin
    // believed the card was issued.
    mockCreate({
      ok: false,
      status: 400,
      body: { success: false, error: "Invalid member" },
    });
    const onRefresh = vi.fn();
    render(<MembersTab members={[]} onRefresh={onRefresh} onDelete={() => {}} />);

    fillForm({ code: "NX-8492", name: "Διπλό", email: "dup@example.com" });
    fireEvent.click(screen.getByRole("button", { name: /Αποθήκευση & Έκδοση Μέλους/ }));

    await waitFor(() =>
      expect(screen.getByText(/Η αποθήκευση απέτυχε\. Ελέγξτε ότι το barcode\/email/)).toBeTruthy()
    );
    expect(onRefresh).not.toHaveBeenCalled();
    // The typed data survives so the admin can fix one field, not retype all.
    expect((screen.getByPlaceholderText("π.χ. NX-9921") as HTMLInputElement).value).toBe("NX-8492");
  });

  it("reports a network failure as a failed save, not a success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    const onRefresh = vi.fn();
    render(<MembersTab members={[]} onRefresh={onRefresh} onDelete={() => {}} />);

    fillForm({ code: "NX-1", name: "Δοκιμή", email: "t@example.com" });
    fireEvent.click(screen.getByRole("button", { name: /Αποθήκευση & Έκδοση Μέλους/ }));

    await waitFor(() => expect(screen.getByText(/Η αποθήκευση απέτυχε/)).toBeTruthy());
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not post at all when required fields are blank", () => {
    const spy = mockCreate({ ok: true, status: 200, body: { success: true } });
    render(<MembersTab members={[]} onRefresh={() => {}} onDelete={() => {}} />);

    // `required` blocks a real click; assert the guard at the form level too.
    expect((document.querySelector("form") as HTMLFormElement).checkValidity()).toBe(false);
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(spy).not.toHaveBeenCalled();
  });

  it("deletes exactly the member whose trash button was clicked", () => {
    const onDelete = vi.fn();
    render(
      <MembersTab
        members={[member(), member({ id: "m-2", member_code: "NX-3109", full_name: "Μαρία" })]}
        onRefresh={() => {}}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Διαγραφή Μέλους" })[1]);

    // Deleting the wrong row removes a paying member's account.
    expect(onDelete).toHaveBeenCalledWith("m-2");
  });

  it("flags the members the access monitor reported", () => {
    render(
      <MembersTab
        members={[member(), member({ id: "m-2", member_code: "NX-3109", full_name: "Μαρία" })]}
        onRefresh={() => {}}
        onDelete={() => {}}
        flaggedMemberIds={["m-2"]}
      />
    );

    // Exactly one "Προσοχή" badge, next to the flagged member.
    expect(screen.getAllByText("Προσοχή")).toHaveLength(1);
    const row = screen.getByText("Μαρία").closest("button")!;
    expect(row.textContent).toContain("Προσοχή");
    expect(screen.getByText("Γιώργος Παπαδόπουλος").closest("button")!.textContent).not.toContain(
      "Προσοχή"
    );
  });

  it("opens the member's profile from their row", async () => {
    // The row is the only way into the detail modal, which carries the barcode
    // the reception desk scans.
    const spy = vi.fn<FetchMock>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        member: {
          ...member(),
          tier_name: "Πλήρες Μέλος",
          has_ai_access: 1,
          subscription_status: "active",
        },
        plans: [],
        visits: [],
      }),
    }));
    vi.stubGlobal("fetch", spy);
    render(<MembersTab members={[member()]} onRefresh={() => {}} onDelete={() => {}} />);

    fireEvent.click(screen.getByText("Γιώργος Παπαδόπουλος"));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Προφίλ μέλους" })).toBeTruthy());
    expect(spy.mock.calls[0]?.[0]).toBe("/api/admin/members?id=m-1");
  });

  it("exposes accessible labels including expiresAt and submits the chosen expiry date", async () => {
    const spy = mockCreate({ ok: true, status: 200, body: { success: true } });
    const onRefresh = vi.fn();

    render(<MembersTab members={[]} onRefresh={onRefresh} onDelete={() => {}} />);

    fireEvent.change(screen.getByLabelText("Κωδικός Κάρτας"), {
      target: { value: "NX-5501" },
    });
    fireEvent.change(screen.getByLabelText("Ονοματεπώνυμο"), {
      target: { value: "Ελένη Κώστα" },
    });
    fireEvent.change(screen.getByLabelText("Ηλεκτρονικό Ταχυδρομείο"), {
      target: { value: "eleni@example.com" },
    });
    fireEvent.change(screen.getByLabelText("PIN Σύνδεσης (4 ψηφία)"), {
      target: { value: "4321" },
    });
    fireEvent.change(screen.getByLabelText("Λήξη Συνδρομής"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Αποθήκευση & Έκδοση Μέλους/ }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    const [, init] = spy.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.member).toMatchObject({
      memberCode: "NX-5501",
      expiresAt: "2027-06-30",
    });
  });

  it("allows renewing and patching a member from the detail modal", async () => {
    const updatedMember = member({ expires_at: "2027-01-31" });
    const spy = vi.fn<FetchMock>(async (_url, init) => {
      if (init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, member: updatedMember }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          member: member(),
          plans: [],
          visits: [],
          exerciseLogs: [],
        }),
      };
    });
    vi.stubGlobal("fetch", spy);
    const onRefresh = vi.fn();

    render(<MembersTab members={[member()]} onRefresh={onRefresh} onDelete={() => {}} />);

    fireEvent.click(screen.getByText("Γιώργος Παπαδόπουλος"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Προφίλ μέλους" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "+1 μήνας" }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    const patchCall = spy.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toBe("/api/admin/members");
    const patchBody = JSON.parse(String((patchCall?.[1] as RequestInit).body));
    expect(patchBody.id).toBe("m-1");
    expect(patchBody.updates.subscriptionStatus).toBe("active");
    expect(patchBody.updates.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
