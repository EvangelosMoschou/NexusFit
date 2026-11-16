// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaultGymConfig } from "@/config/gymConfig";

/**
 * `useGymConfig` memoises its fetch at module scope, so every case resets the
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

describe("Pricing (config-driven plans)", () => {
  it("shows the base and the AI plan from the config, with the add-on difference", async () => {
    const { Component } = await load("@/components/Pricing", "Pricing", defaultGymConfig);
    render(<Component onSelectPlan={() => {}} onOpenAIWizard={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText("Κόστος Συνδρομής & Ψηφιακό Πρόσθετο")).toBeTruthy()
    );
    // The AI card must show the plan the config calls "with assistant", not the
    // first entry — the fallback silently duplicated the base card.
    const headings = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(headings).toHaveLength(2);
    expect(headings[0]).toBe(defaultGymConfig.pricing[0].name);
    expect(headings[1]).toBe(defaultGymConfig.pricing[1].name);
    expect(headings[0]).not.toBe(headings[1]);
    // 59 - 45 = 14€, the "+14€" difference the copy elsewhere relies on.
    expect(screen.getByText("+14€ Ψηφιακό Πρόσθετο")).toBeTruthy();
  });

  it("switches the displayed price with the billing period", async () => {
    const { Component } = await load("@/components/Pricing", "Pricing", defaultGymConfig);
    const { container } = render(<Component onSelectPlan={() => {}} onOpenAIWizard={() => {}} />);
    // Both cards show a price, so read them in document order: [base, ai].
    const prices = () =>
      [...container.querySelectorAll(".text-4xl.font-extrabold")].map((node) => node.textContent);

    await waitFor(() => expect(prices()).toEqual(["45€", "59€"]));

    fireEvent.click(screen.getByRole("button", { name: /Τρίμηνη/ }));
    // The configured quarter price, not 45 x 3.
    expect(prices()).toEqual(["120€", "155€"]);
    expect(screen.getAllByText("/ τρίμηνο")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Ετήσια/ }));
    expect(prices()).toEqual(["390€", "490€"]);
    expect(screen.getAllByText("/ έτος")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Μηνιαία/ }));
    expect(prices()).toEqual(["45€", "59€"]);
    expect(screen.getAllByText("/ μήνα")).toHaveLength(2);
  });

  it("computes the quarterly discount from the configured prices", async () => {
    // 120 vs 3 x 45 = 135 -> 11% off. A hardcoded "-10%" would misstate the
    // offer the moment the owner edits the prices.
    const { Component } = await load("@/components/Pricing", "Pricing", defaultGymConfig);
    render(<Component onSelectPlan={() => {}} onOpenAIWizard={() => {}} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Τρίμηνη/ })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Τρίμηνη (-11%)" })).toBeTruthy();
    // 390 vs 12 x 45 = 540 -> 28% off.
    expect(screen.getByRole("button", { name: "Ετήσια (-28%)" })).toBeTruthy();
  });

  it("reports the chosen plan by name to the caller", async () => {
    const onSelectPlan = vi.fn();
    const onOpenAIWizard = vi.fn();
    const { Component } = await load("@/components/Pricing", "Pricing", defaultGymConfig);
    render(<Component onSelectPlan={onSelectPlan} onOpenAIWizard={onOpenAIWizard} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Πληροφορίες & Επίσκεψη στη Γραμματεία/ })
      ).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: /Πληροφορίες & Επίσκεψη στη Γραμματεία/ }));
    expect(onSelectPlan).toHaveBeenCalledWith(defaultGymConfig.pricing[0].name);

    fireEvent.click(screen.getByRole("button", { name: /Ενεργοποίηση στη Ρεσεψιόν/ }));
    expect(onSelectPlan).toHaveBeenCalledWith(defaultGymConfig.pricing[1].name);

    fireEvent.click(screen.getByRole("button", { name: /Δοκιμή προγράμματος χωρίς εγγραφή/ }));
    expect(onOpenAIWizard).toHaveBeenCalledTimes(1);
  });

  it("renders the features and the add-on badge for the AI plan", async () => {
    const { Component } = await load("@/components/Pricing", "Pricing", defaultGymConfig);
    render(<Component onSelectPlan={() => {}} onOpenAIWizard={() => {}} />);

    await waitFor(() => expect(screen.getByText("45€")).toBeTruthy());
    for (const feature of defaultGymConfig.pricing[0].features) {
      expect(screen.getAllByText(feature).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Προτεινόμενο Πακέτο/)).toBeTruthy();
  });
});
