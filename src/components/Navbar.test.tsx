// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaultGymConfig } from "@/config/gymConfig";
import { scrollToSection } from "@/lib/scroll";

// `useGymConfig` memoises its fetch at module scope, so each test resets the
// module graph and then imports the component fresh. That is the documented
// pattern for a module-level cache in this repo (see floor-plan draft tests).
async function loadWithConfig(config: unknown) {
  vi.resetModules();
  const fetchSpy = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, config }),
  }));
  vi.stubGlobal("fetch", fetchSpy);
  const mod = await import("@/components/Navbar");
  return { Navbar: mod.Navbar, fetchSpy };
}

const props = {
  onOpenContact: vi.fn(),
  onOpenSearch: vi.fn(),
  onOpenLogin: vi.fn(),
  onGoHome: vi.fn(),
};

beforeEach(() => {
  props.onOpenContact.mockClear();
  props.onOpenSearch.mockClear();
  props.onOpenLogin.mockClear();
  props.onGoHome.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Navbar (the config-driven public header)", () => {
  it("renders the gym's own name, not a hardcoded brand", async () => {
    const { Navbar } = await loadWithConfig({
      ...defaultGymConfig,
      gymName: "Δικό Μας Γυμναστήριο",
    });
    render(<Navbar {...props} />);

    // The first paint uses the static defaults; the sibling component fetches
    // also load useGymConfig, so wait for the config response to land.
    await waitFor(() => expect(screen.getByText("Δικό Μας Γυμναστήριο")).toBeTruthy());
    // The brand button's accessible name carries the config name too.
    expect(
      screen.getByRole("button", { name: /Δικό Μας Γυμναστήριο - Επιστροφή στην αρχική σελίδα/ })
    ).toBeTruthy();
  });

  it("adds the announcements link only when the config actually has announcements", async () => {
    const withAnnouncements = await loadWithConfig(defaultGymConfig);
    const { unmount } = render(<withAnnouncements.Navbar {...props} />);
    // Default config ships two announcements, so the link must be present.
    await waitFor(() => expect(screen.getByRole("link", { name: "Ανακοινώσεις" })).toBeTruthy());
    unmount();
    cleanup();

    const withoutAnnouncements = await loadWithConfig({
      ...defaultGymConfig,
      announcements: [],
    });
    render(<withoutAnnouncements.Navbar {...props} />);
    await waitFor(() => expect(screen.getByText("Εγκαταστάσεις")).toBeTruthy());
    // A link to a section that does not render scrolls nowhere.
    expect(screen.queryByRole("link", { name: "Ανακοινώσεις" })).toBeNull();
  });

  it("falls back to the static defaults when the config endpoint fails", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ success: false }) }))
    );
    const mod = await import("@/components/Navbar");
    render(<mod.Navbar {...props} />);

    // The site must never render an empty header just because /api/config died.
    expect(screen.getByText(defaultGymConfig.gymName)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Συνδρομές" })).toBeTruthy();
  });

  it("shows the member menu instead of the login button when signed in", async () => {
    const { Navbar } = await loadWithConfig(defaultGymConfig);
    render(
      <Navbar
        {...props}
        member={
          {
            id: "m-1",
            memberCode: "NX-8492",
            fullName: "Γιώργος Παπαδόπουλος",
            email: "g@example.com",
            joinedAt: "2025-01-04",
            subscription: {
              tier: "standard",
              tierName: "Βασικό",
              status: "active",
              expiresAt: "2026-12-31",
              autoRenew: true,
              hasAIAccess: false,
            },
            savedPlans: [],
          } as never
        }
        onLogout={() => {}}
        onSelectMemberTab={() => {}}
      />
    );

    // Navbar renders the desktop bar and the mobile bar together (CSS decides
    // which is visible), so there is one menu button per breakpoint.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Μενού μέλους" }).length).toBeGreaterThan(0)
    );
    // "Σύνδεση Μέλους" in the desktop bar and "Σύνδεση" in the mobile bar must
    // both be gone; leaving them shows a login prompt to a signed-in member.
    expect(screen.queryByRole("button", { name: /Σύνδεση Μέλους/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Σύνδεση" })).toBeNull();
  });

  it("opens the login, search and contact handlers from the desktop bar", async () => {
    const { Navbar } = await loadWithConfig(defaultGymConfig);
    render(<Navbar {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Αναζήτηση" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Αναζήτηση" }));
    expect(props.onOpenSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Σύνδεση Μέλους/ }));
    expect(props.onOpenLogin).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Επικοινωνία & Επίσκεψη/ }));
    expect(props.onOpenContact).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Επιστροφή στην αρχική σελίδα/ }));
    expect(props.onGoHome).toHaveBeenCalledTimes(1);
  });

  it("opens and closes the mobile drawer, and closes it after choosing a section", async () => {
    const { Navbar } = await loadWithConfig(defaultGymConfig);
    render(<Navbar {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Άνοιγμα μενού" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Άνοιγμα μενού" }));
    // The trigger's label must flip, or a screen reader user cannot tell the
    // state and a sighted user loses the way to close it.
    const close = screen.getByRole("button", { name: "Κλείσιμο μενού" });
    expect(screen.getAllByRole("link", { name: "Συνδρομές" }).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(close);
    expect(screen.queryByRole("button", { name: "Κλείσιμο μενού" })).toBeNull();
  });

  it("closes the mobile drawer when a section is chosen", async () => {
    // The drawer covers the page; leaving it open after a jump hides the
    // section the visitor just asked for.
    const scrollSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 200,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    document.body.innerHTML = '<div id="pricing"></div>';

    const { Navbar } = await loadWithConfig(defaultGymConfig);
    render(<Navbar {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Άνοιγμα μενού" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Άνοιγμα μενού" }));
    fireEvent.click(screen.getAllByRole("link", { name: "Συνδρομές" }).at(-1)!);

    expect(screen.queryByRole("button", { name: "Κλείσιμο μενού" })).toBeNull();
    expect(scrollToSpy).toHaveBeenCalled();

    scrollSpy.mockRestore();
    scrollToSpy.mockRestore();
  });

  it("moves focus to the main content from the skip link", async () => {
    // The skip link is the only keyboard route past a fixed header. It must
    // both focus the target and make it focusable, or focus stays on the link.
    document.body.innerHTML = '<div id="main-content"></div>';
    const { Navbar } = await loadWithConfig(defaultGymConfig);
    render(<Navbar {...props} />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Μετάβαση στο περιεχόμενο" })).toBeTruthy()
    );

    const target = document.getElementById("main-content")!;
    const focusSpy = vi.spyOn(target, "focus");
    // jsdom does not implement scrollIntoView.
    target.scrollIntoView = vi.fn();

    fireEvent.click(screen.getByRole("link", { name: "Μετάβαση στο περιεχόμενο" }));

    expect(target.getAttribute("tabindex")).toBe("-1");
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe("scrollToSection (shared by the header links)", () => {
  afterEach(() => {
    cleanup();
  });

  it("scrolls the named section into view with the header offset", () => {
    document.body.innerHTML = '<div id="schedule"></div>';
    const element = document.getElementById("schedule")!;
    element.getBoundingClientRect = () => ({ top: 500 }) as DOMRect;
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);

    scrollToSection("schedule", 72);

    // 500 (document position) - 72 (fixed header) = 428.
    expect(scrollTo).toHaveBeenCalledWith({ top: 428, behavior: "smooth" });
    vi.unstubAllGlobals();
  });

  it("does nothing for a section that is not on the page", () => {
    document.body.innerHTML = "";
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);

    scrollToSection("does-not-exist");

    expect(scrollTo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
