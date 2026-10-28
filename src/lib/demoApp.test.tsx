// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installMockApi } from "../../site/src/mockApi";
import { DemoApp } from "../../site/src/DemoApp";

beforeAll(() => {
  installMockApi();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe("interactive demo app", () => {
  it("renders the landing page", () => {
    render(<DemoApp />);
    expect(screen.getAllByText("NEXUS ATHLETICS").length).toBeGreaterThan(0);
    expect(screen.getByText("Κόστος Συνδρομής & Ψηφιακό Πρόσθετο")).toBeTruthy();
  });

  it("logs a demo member in, stays on the landing and opens the portal from the menu", async () => {
    render(<DemoApp />);

    fireEvent.click(screen.getByText("Σύνδεση Μέλους"));
    fireEvent.click(screen.getByText("Γ. Παπαδόπουλος (NX-8492)"));

    await waitFor(
      () => expect(screen.getAllByLabelText("Μενού μέλους").length).toBeGreaterThan(0),
      { timeout: 3000 }
    );

    fireEvent.click(screen.getAllByLabelText("Μενού μέλους")[0]);
    fireEvent.click(screen.getByText("Ο λογαριασμός μου"));

    await waitFor(
      () => expect(screen.getByText(/Καλωσήρθατε/)).toBeTruthy(),
      { timeout: 3000 }
    );

    expect(screen.getByText("Συνομιλία με τον Προπονητή")).toBeTruthy();
    expect(screen.getByText(/Αποθηκευμένα Προγράμματα/)).toBeTruthy();
  });

  it("shows the standard member without AI access", async () => {
    render(<DemoApp />);

    fireEvent.click(screen.getByText("Σύνδεση Μέλους"));
    fireEvent.click(screen.getByText("Μ. Κωνσταντίνου (NX-3109)"));

    await waitFor(
      () => expect(screen.getAllByLabelText("Μενού μέλους").length).toBeGreaterThan(0),
      { timeout: 3000 }
    );

    fireEvent.click(screen.getAllByLabelText("Μενού μέλους")[0]);
    fireEvent.click(screen.getByText("Ο λογαριασμός μου"));

    await waitFor(
      () => expect(screen.getByText(/Καλωσήρθατε/)).toBeTruthy(),
      { timeout: 3000 }
    );

    expect(screen.queryByText("Συνομιλία με τον Προπονητή")).toBeNull();
    expect(screen.getByText("Βασικό Πακέτο")).toBeTruthy();
  });
});
