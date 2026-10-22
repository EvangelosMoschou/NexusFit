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
    expect(screen.getByText("Κόστος Συνδρομής & AI Add-on")).toBeTruthy();
  });

  it("logs a demo member in and shows the member portal", async () => {
    render(<DemoApp />);

    fireEvent.click(screen.getByText("Σύνδεση Μέλους"));
    fireEvent.click(screen.getByText("Γ. Παπαδόπουλος (NX-8492)"));

    await waitFor(
      () => expect(screen.getByText(/Καλωσήρθατε/)).toBeTruthy(),
      { timeout: 3000 }
    );

    expect(screen.getByText("AI Coach Q&A")).toBeTruthy();
    expect(screen.getByText(/Αποθηκευμενα Splits/)).toBeTruthy();
  });

  it("shows the standard member without AI access", async () => {
    render(<DemoApp />);

    fireEvent.click(screen.getByText("Σύνδεση Μέλους"));
    fireEvent.click(screen.getByText("Μ. Κωνσταντίνου (NX-3109)"));

    await waitFor(
      () => expect(screen.getByText(/Καλωσήρθατε/)).toBeTruthy(),
      { timeout: 3000 }
    );

    expect(screen.queryByText("AI Coach Q&A")).toBeNull();
    expect(screen.getByText(/Standard Pass/)).toBeTruthy();
  });
});
