import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The floor plan is stored as ONE gzipped, format-tagged payload in its own
// `floor_plan` table. These tests pin the storage contract the HTTP routes rely
// on — opaque bytes in, the same bytes out, an absent row that reports "no plan"
// instead of failing, a save that replaces and bumps `updated_at`, a singleton
// row, idempotent DDL across a restart and tenant isolation.
//
// The data layer is deliberately format-agnostic (it never imports
// `@/modules/gym-floor-plan`), so the fixtures here are plain byte strings. The
// real payload is a serialized plan; using non-JSON bytes is what proves the
// storage layer cannot be tempted to parse it.

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-floorplan-"));
process.env.SQLITE_DATA_DIR = tempDir;

import {
  deleteFloorPlan,
  getDatabase,
  getFloorPlanPayload,
  saveFloorPlanPayload,
} from "@/lib/sqliteDb";
import { getRepository } from "@/lib/db";
import { compressPlanPayload, isCompressedPlanPayload } from "./floorPlanCompression";
import { SCHEMA_SQL } from "./schema";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const TENANT = "t-floorplan";
const encoder = new TextEncoder();

/** A minimal stand-in for an encoded plan: the store must not care. */
const PLAN_A = encoder.encode(
  JSON.stringify({ schemaVersion: 2, title: "Ground floor", categories: [], floors: [] })
);
const PLAN_B = encoder.encode(
  JSON.stringify({ schemaVersion: 2, title: "Two floors", categories: [], floors: [] })
);

const EMPTY_RESULT = { payload: null, format: null, updatedAt: null };

/** Asserts byte equality without relying on Buffer in the assertion output. */
function expectBytes(actual: Uint8Array | null, expected: Uint8Array): void {
  expect(actual).not.toBeNull();
  expect(Array.from(actual!)).toEqual(Array.from(expected));
}

describe("floor plan storage", () => {
  it("round-trips the payload bytes verbatim", () => {
    expect(saveFloorPlanPayload(PLAN_A, TENANT)).toBe(true);

    const record = getFloorPlanPayload(TENANT);
    expectBytes(record.payload, PLAN_A);
    expect(record.format).toBe("gzip");
    expect(typeof record.updatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(record.updatedAt!))).toBe(false);
  });

  it("does not reformat or validate the payload (that belongs to the codec)", () => {
    // Deliberately ugly whitespace, and deliberately not canonical: the storage
    // layer is a byte store, and byte equality is the whole contract.
    const ugly = encoder.encode('{ "schemaVersion":2,   "title":"x","categories":[],"floors":[] }');
    expect(saveFloorPlanPayload(ugly, TENANT)).toBe(true);

    expectBytes(getFloorPlanPayload(TENANT).payload, ugly);
  });

  it("stores non-text bytes without mangling them", () => {
    // A packed binary codec is the planned replacement for the JSON one; the
    // storage layer must be ready for it today. This payload is invalid UTF-8
    // and contains NUL bytes.
    const binary = Uint8Array.from({ length: 512 }, (_, index) => (index * 7) % 256);
    expect(saveFloorPlanPayload(binary, TENANT)).toBe(true);

    expectBytes(getFloorPlanPayload(TENANT).payload, binary);
  });

  it("keeps an empty payload distinct from 'no plan'", () => {
    const tenant = "t-floorplan-empty-payload";
    expect(saveFloorPlanPayload(new Uint8Array(0), tenant)).toBe(true);

    const record = getFloorPlanPayload(tenant);
    expect(record.payload).not.toBeNull();
    expect(record.payload!.length).toBe(0);
    expect(record.updatedAt).not.toBeNull();
  });

  it("reports null for a tenant with no saved plan", () => {
    expect(getFloorPlanPayload("t-floorplan-absent")).toEqual(EMPTY_RESULT);
  });

  it("overwrites the single row and bumps updated_at", async () => {
    const tenant = "t-floorplan-overwrite";
    expect(saveFloorPlanPayload(PLAN_A, tenant)).toBe(true);
    const first = getFloorPlanPayload(tenant);

    // ISO timestamps have millisecond resolution.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(saveFloorPlanPayload(PLAN_B, tenant)).toBe(true);
    const second = getFloorPlanPayload(tenant);

    expectBytes(second.payload, PLAN_B);
    expect(second.updatedAt! > first.updatedAt!).toBe(true);

    // Still exactly one row: the plan is a singleton per tenant database.
    const db = getDatabase(tenant);
    const count = db.prepare("SELECT COUNT(*) as c FROM floor_plan").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("writes the compressed form to disk, not the raw bytes", () => {
    const tenant = "t-floorplan-ondisk";
    const payload = encoder.encode("x".repeat(4096));
    expect(saveFloorPlanPayload(payload, tenant)).toBe(true);

    const row = getDatabase(tenant)
      .prepare("SELECT payload, payload_format, typeof(payload) AS kind FROM floor_plan")
      .get() as { payload: Uint8Array; payload_format: string; kind: string };

    expect(row.kind).toBe("blob");
    expect(row.payload_format).toBe("gzip");
    expect(isCompressedPlanPayload(row.payload)).toBe(true);
    // Repetitive input: the stored row must be far smaller than the payload.
    expect(row.payload.length).toBeLessThan(payload.length / 10);
  });

  it("reports no plan when the stored blob is corrupt instead of throwing", () => {
    const tenant = "t-floorplan-corrupt";
    expect(saveFloorPlanPayload(PLAN_A, tenant)).toBe(true);

    // Simulate a hand-edited/corrupted row, staying inside the size guard.
    const db = getDatabase(tenant);
    const garbage = new Uint8Array(64);
    garbage.set([0x4e, 0x46, 0x01]);
    for (let index = 3; index < garbage.length; index += 1) garbage[index] = index * 13;
    db.prepare("UPDATE floor_plan SET payload = ? WHERE id = 'default'").run(garbage);

    expect(getFloorPlanPayload(tenant)).toEqual(EMPTY_RESULT);
  });

  it("clears the plan and stays idempotent on a second delete", () => {
    const tenant = "t-floorplan-delete";
    saveFloorPlanPayload(PLAN_A, tenant);

    expect(deleteFloorPlan(tenant)).toBe(true);
    expect(getFloorPlanPayload(tenant)).toEqual(EMPTY_RESULT);

    // Nothing left to delete, but the call still succeeds.
    expect(deleteFloorPlan(tenant)).toBe(false);
    expect(getFloorPlanPayload(tenant).payload).toBeNull();
  });

  it("is reachable through the Repository interface", async () => {
    const repository = getRepository("t-floorplan-repo");

    expect(await repository.saveFloorPlanPayload(PLAN_A)).toBe(true);
    const record = await repository.getFloorPlanPayload();
    expectBytes(record.payload, PLAN_A);
    expect(record.updatedAt).toEqual(expect.any(String));

    expect(await repository.deleteFloorPlan()).toBe(true);
    expect(await repository.getFloorPlanPayload()).toEqual(EMPTY_RESULT);
  });

  it("rejects a non-Uint8Array payload without throwing", () => {
    // A typed caller cannot do this; an untyped one (or a future driver) can.
    const bogus = "not bytes" as unknown as Uint8Array;
    expect(saveFloorPlanPayload(bogus, "t-floorplan-bogus")).toBe(false);
    expect(getFloorPlanPayload("t-floorplan-bogus")).toEqual(EMPTY_RESULT);
  });

  it("keeps one tenant's plan invisible to another", () => {
    expect(saveFloorPlanPayload(PLAN_A, "t-floorplan-gym-a")).toBe(true);
    expect(saveFloorPlanPayload(PLAN_B, "t-floorplan-gym-b")).toBe(true);

    expectBytes(getFloorPlanPayload("t-floorplan-gym-a").payload, PLAN_A);
    expectBytes(getFloorPlanPayload("t-floorplan-gym-b").payload, PLAN_B);

    const cleared = deleteFloorPlan("t-floorplan-gym-a");
    expect(cleared).toBe(true);
    expect(getFloorPlanPayload("t-floorplan-gym-a").payload).toBeNull();
    expectBytes(getFloorPlanPayload("t-floorplan-gym-b").payload, PLAN_B);
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

    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "payload",
      "payload_format",
      "updated_at",
    ]);
    expect(columns.find((column) => column.name === "id")?.pk).toBe(1);
    expect(columns.find((column) => column.name === "payload")?.type).toBe("BLOB");
    expect(columns.find((column) => column.name === "payload_format")?.type).toBe("TEXT");
    expect(columns.find((column) => column.name === "updated_at")?.notnull).toBe(1);
    // The legacy column is gone on a fresh database.
    expect(columns.map((column) => column.name)).not.toContain("plan_json");
  });

  it("is idempotent across a simulated restart", () => {
    const tenant = "t-floorplan-restart";
    saveFloorPlanPayload(PLAN_A, tenant);
    const before = getFloorPlanPayload(tenant);

    // Re-running the DDL is exactly what a new process does on first
    // connection against an existing database file.
    const db = getDatabase(tenant);
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
    expect(() => db.exec(SCHEMA_SQL)).not.toThrow();

    const after = getFloorPlanPayload(tenant);
    expectBytes(after.payload, before.payload!);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("keeps one plan per tenant even when a stale row is inserted twice", () => {
    const db = getDatabase("t-floorplan-unique");
    const insert = db.prepare(
      "INSERT INTO floor_plan (id, payload, payload_format, updated_at) VALUES ('default', ?, ?, ?)"
    );
    insert.run(compressPlanPayload(PLAN_A), "gzip", new Date().toISOString());

    expect(() =>
      insert.run(compressPlanPayload(PLAN_B), "gzip", new Date().toISOString())
    ).toThrow();
    expectBytes(getFloorPlanPayload("t-floorplan-unique").payload, PLAN_A);
  });
});
