import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The floor plan moved out of the `gym_config` JSON blob into its own
// `floor_plan` table: one raw JSON string per tenant database. These tests pin
// the storage contract the HTTP routes rely on — a verbatim string in, the same
// string out, an absent row that reports "no plan" instead of failing, a save
// that overwrites and bumps `updated_at`, idempotent DDL across a restart and
// tenant isolation.
//
// The data layer is deliberately format-agnostic (it never imports
// `@/modules/gym-floor-plan`), so the fixture is a plain JSON string.

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-floorplan-"));
process.env.SQLITE_DATA_DIR = tempDir;

import { deleteFloorPlan, getDatabase, getFloorPlanJson, saveFloorPlanJson } from "@/lib/sqliteDb";
import { getRepository } from "@/lib/db";
import { SCHEMA_SQL } from "./schema";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const TENANT = "t-floorplan";

/** A minimal stand-in for a serialized plan: the store must not care. */
const PLAN_A = JSON.stringify({
  schemaVersion: 1,
  title: "Ground floor",
  categories: [],
  floors: [],
});
const PLAN_B = JSON.stringify({
  schemaVersion: 1,
  title: "Two floors",
  categories: [],
  floors: [],
});

describe("floor plan storage", () => {
  it("round-trips the raw JSON string verbatim", () => {
    expect(saveFloorPlanJson(PLAN_A, TENANT)).toBe(true);

    const record = getFloorPlanJson(TENANT);
    expect(record.json).toBe(PLAN_A);
    expect(typeof record.updatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(record.updatedAt!))).toBe(false);
  });

  it("does not reformat or validate the value (that belongs to the module)", () => {
    const ugly = '{ "schemaVersion":1,   "title":"x","categories":[],"floors":[] }';
    expect(saveFloorPlanJson(ugly, TENANT)).toBe(true);

    // Byte-for-byte, whitespace included: the data layer is a string store.
    expect(getFloorPlanJson(TENANT).json).toBe(ugly);
  });

  it("reports null for a tenant with no saved plan", () => {
    expect(getFloorPlanJson("t-floorplan-absent")).toEqual({
      json: null,
      updatedAt: null,
    });
  });

  it("overwrites the single row and bumps updated_at", async () => {
    const tenant = "t-floorplan-overwrite";
    expect(saveFloorPlanJson(PLAN_A, tenant)).toBe(true);
    const first = getFloorPlanJson(tenant);

    // ISO timestamps have millisecond resolution.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(saveFloorPlanJson(PLAN_B, tenant)).toBe(true);
    const second = getFloorPlanJson(tenant);

    expect(second.json).toBe(PLAN_B);
    expect(second.updatedAt! > first.updatedAt!).toBe(true);

    // Still exactly one row: the plan is a singleton per tenant database.
    const db = getDatabase(tenant);
    const count = db.prepare("SELECT COUNT(*) as c FROM floor_plan").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("clears the plan and stays idempotent on a second delete", () => {
    const tenant = "t-floorplan-delete";
    saveFloorPlanJson(PLAN_A, tenant);

    expect(deleteFloorPlan(tenant)).toBe(true);
    expect(getFloorPlanJson(tenant)).toEqual({ json: null, updatedAt: null });

    // Nothing left to delete, but the call still succeeds.
    expect(deleteFloorPlan(tenant)).toBe(false);
    expect(getFloorPlanJson(tenant).json).toBeNull();
  });

  it("is reachable through the Repository interface", async () => {
    const repository = getRepository("t-floorplan-repo");

    expect(await repository.saveFloorPlanJson(PLAN_A)).toBe(true);
    expect(await repository.getFloorPlanJson()).toEqual({
      json: PLAN_A,
      updatedAt: expect.any(String),
    });

    expect(await repository.deleteFloorPlan()).toBe(true);
    expect(await repository.getFloorPlanJson()).toEqual({ json: null, updatedAt: null });
  });

  it("keeps one tenant's plan invisible to another", () => {
    expect(saveFloorPlanJson(PLAN_A, "t-floorplan-gym-a")).toBe(true);
    expect(saveFloorPlanJson(PLAN_B, "t-floorplan-gym-b")).toBe(true);

    expect(getFloorPlanJson("t-floorplan-gym-a").json).toBe(PLAN_A);
    expect(getFloorPlanJson("t-floorplan-gym-b").json).toBe(PLAN_B);

    const cleared = deleteFloorPlan("t-floorplan-gym-a");
    expect(cleared).toBe(true);
    expect(getFloorPlanJson("t-floorplan-gym-a").json).toBeNull();
    expect(getFloorPlanJson("t-floorplan-gym-b").json).toBe(PLAN_B);
  });
});

describe("floor_plan schema", () => {
  it("exists with the documented columns", () => {
    const db = getDatabase("t-floorplan-schema");
    const columns = db.prepare("PRAGMA table_info(floor_plan)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    expect(columns.map((column) => column.name)).toEqual(["id", "plan_json", "updated_at"]);
    expect(columns.find((column) => column.name === "id")?.pk).toBe(1);
    expect(columns.find((column) => column.name === "plan_json")?.notnull).toBe(1);
    expect(columns.find((column) => column.name === "updated_at")?.notnull).toBe(1);
  });

  it("is idempotent across a simulated restart", () => {
    const tenant = "t-floorplan-restart";
    saveFloorPlanJson(PLAN_A, tenant);
    const before = getFloorPlanJson(tenant);

    // Re-running the DDL is exactly what a new process does on first
    // connection against an existing database file.
    const db = getDatabase(tenant);
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();

    const after = getFloorPlanJson(tenant);
    expect(after.json).toBe(before.json);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("keeps one plan per tenant even when a stale row is inserted twice", () => {
    const db = getDatabase("t-floorplan-unique");
    const insert = db.prepare(
      "INSERT INTO floor_plan (id, plan_json, updated_at) VALUES ('default', ?, ?)"
    );
    insert.run(PLAN_A, new Date().toISOString());

    expect(() => insert.run(PLAN_B, new Date().toISOString())).toThrow();
    expect(getFloorPlanJson("t-floorplan-unique").json).toBe(PLAN_A);
  });
});
