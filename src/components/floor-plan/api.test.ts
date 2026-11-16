/**
 * Characterization tests for the floor-plan client.
 *
 * Written BEFORE the shared-fallback change, so each assertion pins behaviour
 * that already shipped: the envelope interpretation, the 304 short-circuit, the
 * Greek fallbacks and the issue passthrough. `fetch` is stubbed rather than
 * mocked at the module boundary, because the point is the HTTP contract.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { addCategory, createEmptyPlan, type GymFloorPlan } from "@/modules/gym-floor-plan";
import {
  clearFloorPlan,
  FloorPlanRequestError,
  loadFloorPlan,
  saveFloorPlan,
} from "@/components/floor-plan/api";

function stubFetch(
  status: number,
  body: unknown,
  extra: { throwOnJson?: boolean } = {}
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (extra.throwOnJson) throw new SyntaxError("Unexpected token < in JSON");
      return body;
    },
  }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function buildPlan(): GymFloorPlan {
  let plan = createEmptyPlan({ title: "NexusFit", rows: 2, cols: 2 });
  plan = addCategory(plan, { name: "Impulse", color: "#2563EB", shortLabel: "IM" });
  return plan;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadFloorPlan", () => {
  it("returns the parsed plan and its timestamp", async () => {
    const plan = buildPlan();
    stubFetch(200, { success: true, plan, updatedAt: "2026-01-01T00:00:00Z" });

    const loaded = await loadFloorPlan("/api/floor-plan");

    expect(loaded.plan).not.toBeNull();
    expect(loaded.plan?.title).toBe("NexusFit");
    expect(loaded.updatedAt).toBe("2026-01-01T00:00:00Z");
    expect(loaded.invalid).toBe(false);
  });

  it("treats a missing plan as a normal answer, not an error", async () => {
    stubFetch(200, { success: true, plan: null });

    const loaded = await loadFloorPlan("/api/floor-plan");

    expect(loaded).toEqual({ plan: null, updatedAt: null, invalid: false });
  });

  it("normalizes an empty or non-string updatedAt to null", async () => {
    stubFetch(200, { success: true, plan: null, updatedAt: "" });
    expect((await loadFloorPlan("/api/floor-plan")).updatedAt).toBeNull();

    stubFetch(200, { success: true, plan: null, updatedAt: 42 });
    expect((await loadFloorPlan("/api/floor-plan")).updatedAt).toBeNull();
  });

  it("flags an unparseable stored plan as invalid without throwing", async () => {
    stubFetch(200, { success: true, plan: { schemaVersion: 1, floors: [] } });

    const loaded = await loadFloorPlan("/api/floor-plan");

    expect(loaded.plan).toBeNull();
    expect(loaded.invalid).toBe(true);
  });

  it("reports the server's invalid flag for a stored-but-rejected row", async () => {
    stubFetch(200, { success: true, plan: null, invalid: true });

    const loaded = await loadFloorPlan("/api/floor-plan");

    expect(loaded.invalid).toBe(true);
  });

  it("short-circuits a 304 without parsing a plan", async () => {
    // A 304 carries no body; reading it must not be attempted.
    const spy = stubFetch(304, undefined, { throwOnJson: true });

    const loaded = await loadFloorPlan("/api/floor-plan");

    expect(loaded).toEqual({ plan: null, updatedAt: null, invalid: false });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("uses no cache option by default so the public endpoint keeps its headers", async () => {
    const spy = stubFetch(200, { success: true, plan: null });

    await loadFloorPlan("/api/floor-plan");

    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init).not.toHaveProperty("cache");
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("passes an explicit cache mode through for the admin caller", async () => {
    const spy = stubFetch(200, { success: true, plan: null });

    await loadFloorPlan("/api/admin/floor-plan", { cache: "no-store" });

    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
  });

  it("throws a FloorPlanRequestError carrying the server message", async () => {
    stubFetch(500, { success: false, message: "Ο server είναι κάτω." });

    await expect(loadFloorPlan("/api/floor-plan")).rejects.toBeInstanceOf(FloorPlanRequestError);
    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({
      message: "Ο server είναι κάτω.",
      status: 500,
      name: "FloorPlanRequestError",
    });
  });

  it("falls back to the Greek load message when the envelope has no text", async () => {
    stubFetch(500, { success: false });

    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({
      message: "Δεν ήταν δυνατή η φόρτωση της κάτοψης.",
    });
  });

  it("falls back to the Greek load message when the body is not JSON", async () => {
    stubFetch(502, undefined, { throwOnJson: true });

    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({
      message: "Δεν ήταν δυνατή η φόρτωση της κάτοψης.",
      status: 502,
    });
  });

  it("prefers `message` over `error`, and `error` over the fallback", async () => {
    stubFetch(400, { success: false, message: "από μήνυμα", error: "από error" });
    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({ message: "από μήνυμα" });

    stubFetch(400, { success: false, error: "από error" });
    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({ message: "από error" });

    // An empty string is not usable text.
    stubFetch(400, { success: false, message: "", error: "" });
    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({
      message: "Δεν ήταν δυνατή η φόρτωση της κάτοψης.",
    });
  });

  it("passes the server's validation issues onto the error", async () => {
    const issues = [{ severity: "error" as const, code: "invalid-cells", message: "κακό πλέγμα" }];
    stubFetch(400, { success: false, message: "Απόρριψη", issues });

    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({ issues });
  });

  it("passes no issues when the field is not an array of issues", async () => {
    stubFetch(400, { success: false, message: "Απόρριψη", issues: ["not-an-issue"] });

    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({ issues: [] });
  });

  it("treats success:true on a non-2xx status as a failure", async () => {
    // The status is the authority: a proxy error page must not be read as data.
    stubFetch(503, { success: true, plan: buildPlan() });

    await expect(loadFloorPlan("/api/floor-plan")).rejects.toMatchObject({ status: 503 });
  });

  it("treats a 2xx envelope without success:true as a failure", async () => {
    stubFetch(200, { plan: buildPlan() });

    await expect(loadFloorPlan("/api/floor-plan")).rejects.toBeInstanceOf(FloorPlanRequestError);
  });
});

describe("saveFloorPlan", () => {
  it("POSTs the plan as a JSON envelope and returns the warnings", async () => {
    const warnings = [{ severity: "warning" as const, code: "sparse", message: "αραιή κάτοψη" }];
    const spy = stubFetch(200, { success: true, warnings });
    const plan = buildPlan();

    const result = await saveFloorPlan("/api/admin/floor-plan", plan);

    expect(result.warnings).toEqual(warnings);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ plan });
  });

  it("returns an empty warning list when the field is absent", async () => {
    stubFetch(200, { success: true });

    await expect(saveFloorPlan("/api/admin/floor-plan", buildPlan())).resolves.toEqual({
      warnings: [],
    });
  });

  it("throws with the save fallback and the server's issues", async () => {
    const issues = [{ severity: "error" as const, code: "bad", message: "κακό" }];
    stubFetch(400, { success: false, issues });

    await expect(saveFloorPlan("/api/admin/floor-plan", buildPlan())).rejects.toMatchObject({
      message: "Η αποθήκευση της κάτοψης απέτυχε.",
      status: 400,
      issues,
    });
  });
});

describe("clearFloorPlan", () => {
  it("resolves on a successful DELETE", async () => {
    const spy = stubFetch(200, { success: true });

    await expect(clearFloorPlan("/api/admin/floor-plan")).resolves.toBeUndefined();
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
  });

  it("throws with the delete fallback when the server refuses", async () => {
    stubFetch(500, { success: false });

    await expect(clearFloorPlan("/api/admin/floor-plan")).rejects.toMatchObject({
      message: "Η διαγραφή της κάτοψης απέτυχε.",
      status: 500,
    });
  });
});
