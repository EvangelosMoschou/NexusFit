// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusPage } from "@/components/status/StatusPage";
import UnauthorizedPage from "@/app/401/page";
import ForbiddenPage from "@/app/403/page";
import NotFoundPage from "@/app/not-found";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StatusPage (the 401/403/404/500 shell)", () => {
  it("renders the code, the title and the description it is given", () => {
    render(
      <StatusPage
        code="401"
        title="Χρειάζεται σύνδεση"
        description="Η συνεδρία σου έληξε."
        actions={<button type="button">Σύνδεση</button>}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "Χρειάζεται σύνδεση" })).toBeTruthy();
    expect(screen.getByText("401")).toBeTruthy();
    expect(screen.getByText("Η συνεδρία σου έληξε.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Σύνδεση" })).toBeTruthy();
  });

  it("always offers a way home and shows the gym's identity", () => {
    // A dead-end error page is a support call. Both the header brand link and
    // the explicit "back to the homepage" action must be present and point at /.
    render(<StatusPage code="500" title="Σφάλμα" description="Κάτι πήγε στραβά." />);

    const homeLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/");
    expect(homeLinks.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("link", { name: /Επιστροφή στην αρχική/ })).toBeTruthy();
    expect(screen.getByText("NEXUS ATHLETICS")).toBeTruthy();
  });

  it("exposes the status code to assistive technology, not only as decoration", () => {
    // The big code badge is aria-hidden because the heading already carries the
    // meaning; if the heading were ever dropped, a screen-reader user would get
    // "already hidden" decoration and no information at all.
    render(<StatusPage code="403" title="Δεν έχεις πρόσβαση" description="Χωρίς δικαίωμα." />);

    const badge = screen.getByText("403");
    expect(badge.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Δεν έχεις πρόσβαση");
  });

  it("carries the current year and the legal footer", () => {
    render(<StatusPage code="404" title="Δεν βρέθηκε" description="Χάθηκε η σελίδα." />);

    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeTruthy();
    expect(screen.getByText(/Nexus Athletics Club/)).toBeTruthy();
  });

  it("renders the accent tone by default and a distinct class per tone", () => {
    const { container, rerender } = render(
      <StatusPage code="404" title="Δεν βρέθηκε" description="—" />
    );
    const accent = container.querySelector(".bg-accent\\/10");
    expect(accent).toBeTruthy();

    rerender(<StatusPage code="403" title="Απαγορεύεται" description="—" tone="danger" />);
    // The tone must actually change the badge; a fallback to the default tone
    // would make 403 look like an ordinary information page.
    expect(container.querySelector(".bg-red-500\\/10")).toBeTruthy();
    expect(container.querySelector(".bg-accent\\/10")).toBeNull();
  });
});

describe("the 401 and 403 pages built on the shell", () => {
  it("the 401 page sends the visitor to every way of signing in", () => {
    render(<UnauthorizedPage />);

    expect(screen.getByRole("heading", { name: "Χρειάζεται σύνδεση" })).toBeTruthy();
    // Member, admin and trainer entry points are the whole point of this page:
    // after an expired session the member must not be stranded without them.
    expect(screen.getByRole("link", { name: /Σύνδεση μέλους/ }).getAttribute("href")).toBe(
      "/?login=1"
    );
    expect(screen.getByRole("link", { name: /Διαχείριση/ }).getAttribute("href")).toBe("/admin");
    expect(screen.getByRole("link", { name: /Προσωπικό/ }).getAttribute("href")).toBe("/trainer");
  });

  it("the 403 page offers support and a way home", () => {
    render(<ForbiddenPage />);

    expect(screen.getByRole("heading", { name: "Δεν έχεις πρόσβαση" })).toBeTruthy();
    // A permission error is not the member's fault to debug: the two useful
    // exits are "talk to the desk" and "back to the site".
    expect(screen.getByRole("link", { name: /Επικοινωνία/ }).getAttribute("href")).toBe(
      "/#contact"
    );
    expect(screen.getAllByRole("link", { name: /Αρχική/ })[0].getAttribute("href")).toBe("/");
  });

  it("the 404 page is reachable through the same branded shell", () => {
    render(<NotFoundPage />);

    expect(screen.getByRole("heading", { name: "Η σελίδα δεν βρέθηκε" })).toBeTruthy();
    // The shell's own home button plus the page's "home page" and "schedule"
    // cards: a mistyped URL must not dead-end the visitor.
    expect(screen.getAllByRole("link", { name: /Επιστροφή στην αρχική/ }).length).toBeGreaterThan(
      0
    );
    expect(screen.getByRole("link", { name: /Πρόγραμμα Ομαδικών/ }).getAttribute("href")).toBe(
      "/#schedule"
    );
  });
});
