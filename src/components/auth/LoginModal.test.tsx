// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginModal } from "@/components/auth/LoginModal";

const MEMBER = {
  id: "m-1",
  memberCode: "NX-8492",
  fullName: "Γιώργος Παπαδόπουλος",
  email: "g.papadopoulos@example.com",
  joinedAt: "2025-01-04T00:00:00.000Z",
  subscription: {
    tier: "all_inclusive_ai" as const,
    tierName: "Πλήρες (Ψηφιακός Βοηθός)",
    status: "active" as const,
    expiresAt: "2026-12-31",
    autoRenew: true,
    hasAIAccess: true,
  },
  savedPlans: [],
};

/** Routes the login endpoint: the first matching entry wins. */
function mockLogin(
  handler: (body: { identifier: string; pin: string }) => {
    ok: boolean;
    status: number;
    json: unknown;
  }
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/auth/member");
    const body = JSON.parse(String(init?.body)) as { identifier: string; pin: string };
    const reply = handler(body);
    return { ok: reply.ok, status: reply.status, json: async () => reply.json };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function typeCredentials(identifier = "NX-8492", pin = "1234") {
  fireEvent.change(screen.getByLabelText(/Κωδικός Μέλους ή Ηλεκτρονικό Ταχυδρομείο/), {
    target: { value: identifier },
  });
  fireEvent.change(screen.getByLabelText(/PIN Ασφαλείας/), { target: { value: pin } });
}

function submit(): boolean {
  // fireEvent.click returns false when the browser's own form validation
  // cancelled the submit, which is how a blank required field is blocked.
  return fireEvent.click(screen.getByRole("button", { name: "Σύνδεση στο Dashboard" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginModal (member sign-in)", () => {
  it("renders nothing at all while closed", () => {
    render(<LoginModal isOpen={false} onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    // A closed modal must not leave a password field in the page to be found by
    // autofill or a screen reader.
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("shows an accessible dialog with labelled fields and a masked PIN", () => {
    render(<LoginModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Σύνδεση μέλους" })).toBeTruthy();
    expect(screen.getByLabelText(/Κωδικός Μέλους ή Ηλεκτρονικό Ταχυδρομείο/)).toBeTruthy();
    const pin = screen.getByLabelText(/PIN Ασφαλείας/) as HTMLInputElement;
    expect(pin.type).toBe("password");
    // Every interactive control has a name a screen reader can announce.
    expect(screen.getByRole("button", { name: "Κλείσιμο" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Σύνδεση στο Dashboard" })).toBeTruthy();
  });

  it("never sends a blank form to the API", async () => {
    const spy = mockLogin(() => ({ ok: true, status: 200, json: { success: true } }));
    render(<LoginModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    // `required` is on both fields, so the browser cancels the submit before
    // React's handler runs. A blank form must never spend one of the five
    // per-member attempts the server allows.
    expect((document.querySelector("form") as HTMLFormElement).checkValidity()).toBe(false);
    submit();
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports the missing field when a submit reaches the handler anyway", async () => {
    // `required` is the first line of defence, not the only one: a browser
    // without constraint validation, or any code that dispatches `submit`
    // directly, reaches the handler's own guard. It must not post a half-empty
    // form and must say what is missing.
    const spy = mockLogin(() => ({ ok: true, status: 200, json: { success: true } }));
    render(<LoginModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Κωδικός Μέλους ή Ηλεκτρονικό Ταχυδρομείο/), {
      target: { value: "NX-8492" },
    });
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() =>
      expect(screen.getByText("Συμπληρώστε τον Κωδικό Μέλους και το PIN.")).toBeTruthy()
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("signs the member in and closes the dialog", async () => {
    mockLogin(() => ({ ok: true, status: 200, json: { success: true, member: MEMBER } }));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<LoginModal isOpen onClose={onClose} onSuccess={onSuccess} />);

    typeCredentials("NX-8492", "1234");
    submit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(MEMBER));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the server's message when the PIN is wrong, and stays open", async () => {
    mockLogin(() => ({
      ok: false,
      status: 401,
      json: { success: false, error: "Λανθασμένος κωδικός μέλους ή PIN." },
    }));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<LoginModal isOpen onClose={onClose} onSuccess={onSuccess} />);

    typeCredentials("NX-8492", "9999");
    submit();

    await waitFor(() => expect(screen.getByText("Λανθασμένος κωδικός μέλους ή PIN.")).toBeTruthy());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The typed code is kept so the member only has to retry the PIN.
    expect(
      (screen.getByLabelText(/Κωδικός Μέλους ή Ηλεκτρονικό Ταχυδρομείο/) as HTMLInputElement).value
    ).toBe("NX-8492");
  });

  it("surfaces a rate-limit rejection instead of failing silently", async () => {
    // The route answers 429 "Πολλές προσπάθειες σύνδεσης…" after five tries for
    // the same member code. Anything other than a 401 used to fall through with
    // no error set, so the member saw the spinner stop and nothing else.
    mockLogin(() => ({
      ok: false,
      status: 429,
      json: { success: false, error: "Πολλές προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε λίγο." },
    }));
    render(<LoginModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    typeCredentials("NX-8492", "1234");
    submit();

    await waitFor(() =>
      expect(screen.getByText("Πολλές προσπάθειες σύνδεσης. Δοκιμάστε ξανά σε λίγο.")).toBeTruthy()
    );
    // The button is usable again: the member is not stuck behind a dead form.
    expect(
      (screen.getByRole("button", { name: "Σύνδεση στο Dashboard" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("shows a generic error when a 200 answer carries no member", async () => {
    // A misconfigured or half-migrated server can answer `success: true` with no
    // member. Signing the visitor in with `undefined` would crash the portal.
    mockLogin(() => ({ ok: true, status: 200, json: { success: true } }));
    const onSuccess = vi.fn();
    render(<LoginModal isOpen onClose={() => {}} onSuccess={onSuccess} />);

    typeCredentials();
    submit();

    await waitFor(() => expect(screen.getByText(/Αποτυχία σύνδεσης/)).toBeTruthy());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("reports a server error instead of stopping the spinner in silence", async () => {
    mockLogin(() => ({
      ok: false,
      status: 500,
      json: { success: false, error: "Σφάλμα βάσης δεδομένων." },
    }));
    render(<LoginModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    typeCredentials();
    submit();

    await waitFor(() => expect(screen.getByText("Σφάλμα βάσης δεδομένων.")).toBeTruthy());
  });

  it("reports a dead network as a connection failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    render(<LoginModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    typeCredentials();
    submit();

    await waitFor(() => expect(screen.getByText("Αποτυχία σύνδεσης.")).toBeTruthy());
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<LoginModal isOpen onClose={onClose} onSuccess={() => {}} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("signs a demo member in with one click", async () => {
    // The two quick-demo buttons are the only way into the portal when the
    // seeded PIN is not known; they must actually post the code they advertise.
    const spy = mockLogin(() => ({
      ok: true,
      status: 200,
      json: { success: true, member: MEMBER },
    }));
    const onSuccess = vi.fn();
    render(<LoginModal isOpen onClose={() => {}} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole("button", { name: /Γ\. Παπαδόπουλος \(NX-8492\)/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(MEMBER));
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body))).toEqual({
      identifier: "NX-8492",
      pin: "1234",
    });
  });
});
