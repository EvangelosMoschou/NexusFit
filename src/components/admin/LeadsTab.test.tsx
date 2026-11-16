// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeadsTab, type LeadItem } from "@/components/admin/LeadsTab";

function lead(overrides: Partial<LeadItem> = {}): LeadItem {
  return {
    id: "lead-1",
    full_name: "Νίκος Δοκιμαστικός",
    email: "nikos@example.com",
    phone: "6900000000",
    goal: "Απώλεια βάρους",
    preferred_plan: "Πλήρες Μέλος",
    notes: "Ενδιαφέρομαι για πρωινά",
    status: "pending",
    created_at: "2026-02-01T09:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LeadsTab (admin lead pipeline)", () => {
  it("renders a lead with its contact details, plan interest and note", () => {
    render(
      <LeadsTab
        leads={[lead()]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByText("Νίκος Δοκιμαστικός")).toBeTruthy();
    expect(screen.getByText("nikos@example.com")).toBeTruthy();
    expect(screen.getByText("6900000000")).toBeTruthy();
    expect(screen.getByText(/Πλήρες Μέλος/)).toBeTruthy();
    expect(screen.getByText(/Ενδιαφέρομαι για πρωινά/)).toBeTruthy();
  });

  it("maps each stored status to the Greek label the desk reads", () => {
    const { rerender } = render(
      <LeadsTab
        leads={[lead({ status: "pending" })]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText("Εκκρεμεί")).toBeTruthy();

    rerender(
      <LeadsTab
        leads={[lead({ status: "contacted" })]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText("Έγινε Επαφή")).toBeTruthy();

    rerender(
      <LeadsTab
        leads={[lead({ status: "registered" })]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText("Εγγράφηκε")).toBeTruthy();
  });

  it("never offers a transition that would move a converted lead backwards", () => {
    const { rerender } = render(
      <LeadsTab
        leads={[lead({ status: "pending" })]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );
    // Pending: both next steps are offered.
    expect(screen.getByRole("button", { name: "Σημείωση: Επικοινωνήσαμε" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Εγγραφή στο Γυμναστήριο" })).toBeTruthy();

    rerender(
      <LeadsTab
        leads={[lead({ status: "contacted" })]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );
    // Already contacted: no point offering it again (a second click would be a
    // duplicate write), but registering is still allowed.
    expect(screen.queryByRole("button", { name: "Σημείωση: Επικοινωνήσαμε" })).toBeNull();
    expect(screen.getByRole("button", { name: "Εγγραφή στο Γυμναστήριο" })).toBeTruthy();

    rerender(
      <LeadsTab
        leads={[lead({ status: "registered" })]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );
    // Registered is terminal: neither transition is offered. Offering
    // "Επικοινωνήσαμε" here moved a converted lead back to `contacted` with a
    // single click, losing the conversion the gym had already paid for.
    expect(screen.queryByRole("button", { name: "Σημείωση: Επικοινωνήσαμε" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Εγγραφή στο Γυμναστήριο" })).toBeNull();
  });

  it("reports the contacted transition against the right lead", () => {
    const onUpdateStatus = vi.fn();
    render(
      <LeadsTab
        leads={[lead(), lead({ id: "lead-2", full_name: "Δεύτερος", status: "pending" })]}
        onRefresh={() => {}}
        onUpdateStatus={onUpdateStatus}
        onDelete={() => {}}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Σημείωση: Επικοινωνήσαμε" })[1]);

    expect(onUpdateStatus).toHaveBeenCalledWith("lead-2", "contacted");
  });

  it("reports the registered transition", () => {
    const onUpdateStatus = vi.fn();
    render(
      <LeadsTab
        leads={[lead()]}
        onRefresh={() => {}}
        onUpdateStatus={onUpdateStatus}
        onDelete={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Εγγραφή στο Γυμναστήριο" }));

    expect(onUpdateStatus).toHaveBeenCalledWith("lead-1", "registered");
  });

  it("deletes exactly the lead whose trash button was clicked", () => {
    const onDelete = vi.fn();
    render(
      <LeadsTab
        leads={[lead(), lead({ id: "lead-2", full_name: "Δεύτερος" })]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Διαγραφή αιτήματος" })[0]);

    expect(onDelete).toHaveBeenCalledWith("lead-1");
  });

  it("refreshes the pipeline on demand", () => {
    const onRefresh = vi.fn();
    render(
      <LeadsTab
        leads={[lead()]}
        onRefresh={onRefresh}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Ανανέωση/ }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state instead of a blank panel", () => {
    render(
      <LeadsTab leads={[]} onRefresh={() => {}} onUpdateStatus={() => {}} onDelete={() => {}} />
    );

    expect(screen.getByText("Δεν υπάρχουν ακόμη νέα αιτήματα επικοινωνίας.")).toBeTruthy();
  });

  it("omits the optional phone and note rather than rendering empty labels", () => {
    render(
      <LeadsTab
        leads={[lead({ phone: null, notes: null, preferred_plan: null })]}
        onRefresh={() => {}}
        onUpdateStatus={() => {}}
        onDelete={() => {}}
      />
    );

    // A "Τηλ: " with nothing after it looks like a lead with a missing number.
    expect(screen.queryByText(/Τηλ:/)).toBeNull();
    expect(screen.queryByText(/Ενδιαφέρον για:/)).toBeNull();
    expect(screen.getByText("Νίκος Δοκιμαστικός")).toBeTruthy();
  });
});
