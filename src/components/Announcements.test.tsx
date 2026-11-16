// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { defaultGymConfig } from "@/config/gymConfig";

/**
 * The config hook memoises its fetch at module scope, so every case resets the
 * module graph and imports the component under test fresh. Fetch is stubbed
 * BEFORE the import so the first render already sees the intended response.
 */
async function load(modulePath: string, exportName: string, config: unknown) {
  vi.resetModules();
  const spy = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, config }),
  }));
  vi.stubGlobal("fetch", spy);
  const mod = (await import(/* @vite-ignore */ modulePath)) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return { Component: mod[exportName], spy };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Announcements (config-driven notice board)", () => {
  it("renders every notice with its date reformatted for Greek readers", async () => {
    const { Component } = await load("@/components/Announcements", "Announcements", {
      ...defaultGymConfig,
      announcements: [
        {
          id: "a-1",
          title: "Κλειστό λόγω εργασιών",
          body: "Το πρωί της Δευτέρας.",
          level: "info",
          date: "2026-03-04",
        },
      ],
    });
    render(<Component />);

    await waitFor(() => expect(screen.getByText("Κλειστό λόγω εργασιών")).toBeTruthy());
    // The stored value is ISO; the reader must see DD/MM/YYYY.
    expect(screen.getByText("04/03/2026")).toBeTruthy();
    expect(screen.queryByText("2026-03-04")).toBeNull();
    expect(screen.getByText("Το πρωί της Δευτέρας.")).toBeTruthy();
    // The section has an id the Navbar links to.
    expect(document.getElementById("announcements")).toBeTruthy();
  });

  it("renders nothing at all when the gym has no announcements", async () => {
    const { Component } = await load("@/components/Announcements", "Announcements", {
      ...defaultGymConfig,
      announcements: [],
    });
    const { container } = render(<Component />);

    await waitFor(() => expect(document.getElementById("announcements")).toBeNull());
    // Not even an empty section: a heading with nothing under it looks broken.
    expect(container.textContent).toBe("");
  });

  it("tolerates a config with the announcements key missing entirely", async () => {
    const { announcements: _omitted, ...rest } = defaultGymConfig;
    void _omitted;
    const { Component } = await load("@/components/Announcements", "Announcements", rest);
    const { container } = render(<Component />);

    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("keeps the multi-line body readable instead of collapsing it", async () => {
    const { Component } = await load("@/components/Announcements", "Announcements", {
      ...defaultGymConfig,
      announcements: [
        {
          id: "a-1",
          title: "Πρόγραμμα",
          body: "Γραμμή 1\nΓραμμή 2",
          level: "info",
        },
      ],
    });
    render(<Component />);

    await waitFor(() => expect(screen.getByText("Πρόγραμμα")).toBeTruthy());
    // `whitespace-pre-line` is what keeps the newlines; a normalised class would
    // silently turn a schedule into one run-on sentence.
    const body = screen.getByText(/Γραμμή 1/);
    expect(body.className).toContain("whitespace-pre-line");
  });
});
