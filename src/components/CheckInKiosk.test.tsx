// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CheckInKiosk } from "@/components/CheckInKiosk";

interface KioskReply {
  ok?: boolean;
  status?: number;
  json: unknown;
}

type FetchMock = (url: string, init?: RequestInit) => Promise<unknown>;

function mockKiosk(replies: KioskReply[]): ReturnType<typeof vi.fn> {
  let index = 0;
  const spy = vi.fn<FetchMock>(async () => {
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      json: async () => reply.json,
    };
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function fill(code = "NX-8492", pin = "1234") {
  fireEvent.change(screen.getByLabelText("Κωδικός μέλους"), { target: { value: code } });
  fireEvent.change(screen.getByLabelText("PIN"), { target: { value: pin } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CheckInKiosk (the tablet at the entrance)", () => {
  it("puts the caret in the member-code field on load", () => {
    // The kiosk is used with a barcode scanner and a keyboard, never a mouse.
    // If the first field is not focused, the scanned code lands nowhere.
    mockKiosk([{ json: { success: true } }]);
    render(<CheckInKiosk />);

    expect(document.activeElement).toBe(screen.getByLabelText("Κωδικός μέλους"));
  });

  it("records an entry and shows the new occupancy", async () => {
    const spy = mockKiosk([
      {
        json: {
          success: true,
          status: "in",
          memberName: "Γιώργος Παπαδόπουλος",
          memberCode: "NX-8492",
          occupancy: { inside: 12, capacity: 80 },
        },
      },
    ]);
    render(<CheckInKiosk />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: /Είσοδος/ }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("καταγράφηκε η είσοδος")
    );
    expect(screen.getByRole("status").textContent).toContain("Γιώργος Παπαδόπουλος");
    expect(screen.getByRole("status").textContent).toContain("NX-8492");

    // The next member must be able to walk up immediately: the fields are
    // cleared and focus returns to the code field for the scanner.
    expect((screen.getByLabelText("Κωδικός μέλους") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("PIN") as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(screen.getByLabelText("Κωδικός μέλους"));

    // Occupancy is what the desk staff watch; it must replace the "Premium
    // only" placeholder with the live count and the capacity it belongs to.
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText(/\/\s*80\s*$/)).toBeTruthy();
    expect(screen.queryByText(/Η πληρότητα είναι για Premium μέλη/)).toBeNull();

    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ identifier: "NX-8492", pin: "1234", action: "in" });
  });

  it("records a check-out and keeps the member-facing wording distinct", async () => {
    const spy = mockKiosk([
      {
        json: {
          success: true,
          status: "not_in",
          memberName: "Μαρία Κωνσταντίνου",
          memberCode: "NX-3109",
          occupancy: { inside: 11, capacity: 80 },
        },
      },
    ]);
    render(<CheckInKiosk />);

    fill("NX-3109", "4321");
    fireEvent.click(screen.getByRole("button", { name: /Έξοδος/ }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("δεν ήταν μέσα"));
    // "Έξοδος" must send action "out", never "in".
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).action).toBe("out");
  });

  it("will not send a half-filled form to the server", async () => {
    const spy = mockKiosk([{ json: { success: true } }]);
    render(<CheckInKiosk />);

    fireEvent.click(screen.getByRole("button", { name: /Είσοδος/ }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Συμπληρώστε κωδικό μέλους και PIN.")
    );
    // Each rejected attempt would otherwise burn one of the five server-side
    // attempts allowed per member code per minute.
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows the server's refusal for an inactive subscription", async () => {
    // The route answers 403 with a Greek explanation for an expired membership.
    // Showing a generic "failed" instead sends people to the wrong department.
    mockKiosk([
      {
        ok: false,
        status: 403,
        json: {
          success: false,
          locked: true,
          subscriptionActive: false,
          error: "Η συνδρομή σου δεν είναι ενεργή. Επικοινώνησε με τη ρεσεψιόν.",
        },
      },
    ]);
    render(<CheckInKiosk />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: /Είσοδος/ }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Η συνδρομή σου δεν είναι ενεργή")
    );
    // A refusal must not look like a success: the kiosk keeps the typed values
    // so the member can be identified at the desk without re-scanning.
    expect((screen.getByLabelText("Κωδικός μέλους") as HTMLInputElement).value).toBe("NX-8492");
  });

  it("reports a rate limit instead of silently doing nothing", async () => {
    mockKiosk([
      {
        ok: false,
        status: 429,
        json: { success: false, error: "Πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγο." },
      },
    ]);
    render(<CheckInKiosk />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: /Είσοδος/ }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Πολλές προσπάθειες")
    );
  });

  it("keeps a network failure inside the status region", async () => {
    // `submit` rethrows the raw fetch TypeError, so the kiosk surfaces the
    // browser's own message ("Failed to fetch") rather than a Greek one. That
    // is poor copy but it IS visible and it does not hang: pin the part that
    // matters, that the failure reaches the operator at all.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    render(<CheckInKiosk />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: /Είσοδος/ }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Failed to fetch")
    );
    // The buttons are usable again, so the next member is not stuck.
    expect((screen.getByRole("button", { name: /Είσοδος/ }) as HTMLButtonElement).disabled).toBe(
      false
    );
    // A failed scan must not change the occupancy display: the placeholder stays.
    expect(screen.getByText(/Η πληρότητα είναι για Premium μέλη/)).toBeTruthy();
  });

  it("hides the occupancy count until a member is identified", () => {
    // Occupancy is Premium information. Before the first successful scan the
    // kiosk must not leak it, and must say why instead.
    mockKiosk([{ json: { success: true } }]);
    render(<CheckInKiosk />);

    expect(screen.getByText(/Η πληρότητα είναι για Premium μέλη/)).toBeTruthy();
    expect(screen.queryByText(/Μέσα τώρα/)).toBeNull();
  });

  it("disables both buttons while a scan is in flight", async () => {
    // Typed as an object field so TS keeps the call signature after the
    // executor's assignment (a bare `let` narrows to `never` at the call site).
    const handle: { release?: () => void } = {};
    const gate = new Promise<void>((resolve) => {
      handle.release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, status: "in", memberName: "Α", memberCode: "NX-1" }),
        };
      })
    );
    render(<CheckInKiosk />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: /Είσοδος/ }));

    // A double scan is a real double-check-in; both buttons must lock.
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /Είσοδος/ }) as HTMLButtonElement).disabled).toBe(
        true
      )
    );
    expect((screen.getByRole("button", { name: /Έξοδος/ }) as HTMLButtonElement).disabled).toBe(
      true
    );

    handle.release?.();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /Είσοδος/ }) as HTMLButtonElement).disabled).toBe(
        false
      )
    );
  });
});
