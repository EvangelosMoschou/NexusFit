import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Characterization tests for the query functions that had no coverage at all
// before the data layer was split into modules. They pin the ordering, the
// limit clamping, the joins and the cutoff semantics, so the split and any
// later change to these queries is provably behaviour-preserving.

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-queries-test-"));
process.env.SQLITE_DATA_DIR = tempDir;

import {
  closeStaleVisits,
  getDatabase,
  getLastCheckoutAt,
  getRecentVisits,
  getVisitIntervalsSince,
  listMemberAccessEvents,
  listMemberSessionHistory,
} from "@/lib/sqliteDb";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const TENANT = "t-queries";
const db = getDatabase(TENANT);

function addMember(id: string, code: string): void {
  db.prepare(
    `INSERT INTO members (id, member_code, full_name, email, pin_code, tier_name, has_ai_access, subscription_status, expires_at, created_at)
     VALUES (?, ?, ?, ?, 'scrypt:a:b', 'T', 0, 'active', '2030-01-01', '2024-01-01T00:00:00.000Z')`
  ).run(id, code, `Member ${code}`, `${code.toLowerCase()}@example.com`);
}

addMember("m-queries-1", "NX-Q1");
addMember("m-queries-2", "NX-Q2");

// Fixed instants: comparing against a freshly computed timestamp would drift by
// the few milliseconds between the insert and the assertion.
const BASE = Date.now();
const hoursAgo = (hours: number) => new Date(BASE - hours * 60 * 60 * 1000).toISOString();

describe("listMemberSessionHistory", () => {
  it("returns every session for the member, newest first, including revoked ones", () => {
    const insert = db.prepare(
      `INSERT INTO member_sessions (session_id_hash, member_id, created_at, last_seen_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insert.run("h-old", "m-queries-1", 1_000, 1_000, 9_000_000_000_000, null);
    insert.run("h-new", "m-queries-1", 3_000, 3_000, 9_000_000_000_000, null);
    insert.run("h-revoked", "m-queries-1", 2_000, 2_000, 9_000_000_000_000, 2_500);
    insert.run("h-other", "m-queries-2", 4_000, 4_000, 9_000_000_000_000, null);

    const history = listMemberSessionHistory("m-queries-1", 1000, TENANT);

    expect(history.map((row) => row.session_id_hash)).toEqual(["h-new", "h-revoked", "h-old"]);
    expect(history.some((row) => row.revoked_at !== null)).toBe(true);
  });

  it("clamps the limit to at least 1", () => {
    expect(listMemberSessionHistory("m-queries-1", 0, TENANT)).toHaveLength(1);
  });
});

describe("getLastCheckoutAt", () => {
  it("returns null when the member has never checked out", () => {
    expect(getLastCheckoutAt("m-queries-2", TENANT)).toBeNull();
  });

  it("returns the most recent check-out timestamp", () => {
    const insert = db.prepare(
      `INSERT INTO visits (id, member_id, checked_in_at, checked_out_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    insert.run("v-1", "m-queries-2", hoursAgo(30), hoursAgo(29), hoursAgo(30));
    insert.run("v-2", "m-queries-2", hoursAgo(10), hoursAgo(9), hoursAgo(10));

    expect(getLastCheckoutAt("m-queries-2", TENANT)).toBe(hoursAgo(9));
    expect(getLastCheckoutAt("m-queries-2", TENANT)).toBe(hoursAgo(9));
  });
});

describe("listMemberAccessEvents", () => {
  it("returns only that member's events, newest first, with parsed details", () => {
    const insert = db.prepare(
      `INSERT INTO access_events (id, member_id, event_type, details, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    insert.run("e-1", "m-queries-1", "duplicate_entry", '{"direction":"in"}', hoursAgo(5));
    insert.run("e-2", "m-queries-1", "quick_reentry", '{"direction":"in"}', hoursAgo(1));
    insert.run("e-other", "m-queries-2", "duplicate_entry", "{}", hoursAgo(2));

    const events = listMemberAccessEvents("m-queries-1", 1000, TENANT);

    expect(events.map((event) => event.id)).toEqual(["e-2", "e-1"]);
    expect(events[0].details).toEqual({ direction: "in" });
  });

  it("clamps the limit to at least 1", () => {
    expect(listMemberAccessEvents("m-queries-1", 0, TENANT)).toHaveLength(1);
  });
});

describe("getVisitIntervalsSince", () => {
  it("returns the intervals that started after the cutoff, oldest first", () => {
    // Only the visit that started 10h ago is after the 20h cutoff.
    expect(getVisitIntervalsSince(hoursAgo(20), TENANT)).toEqual([
      { checked_in_at: hoursAgo(10), checked_out_at: hoursAgo(9) },
    ]);

    // Both recorded visits are after a 40h cutoff, oldest first.
    const intervals = getVisitIntervalsSince(hoursAgo(40), TENANT);
    expect(intervals.map((interval) => interval.checked_in_at)).toEqual([
      hoursAgo(30),
      hoursAgo(10),
    ]);
  });
});

describe("getRecentVisits", () => {
  it("joins the member code and name and orders newest first", () => {
    const visits = getRecentVisits(10, TENANT);

    expect(visits.map((visit) => visit.id)).toEqual(["v-2", "v-1"]);
    expect(visits[0].member_code).toBe("NX-Q2");
    expect(visits[0].full_name).toBe("Member NX-Q2");
  });
});

describe("closeStaleVisits", () => {
  it("closes only the visits older than the cutoff and reports the count", () => {
    const insert = db.prepare(
      `INSERT INTO visits (id, member_id, checked_in_at, checked_out_at, created_at)
       VALUES (?, ?, ?, NULL, ?)`
    );
    // One member can only have a single open visit (unique partial index), so
    // each stale/recent pair needs its own member.
    addMember("m-stale", "NX-ST");
    addMember("m-recent", "NX-RC");
    insert.run("v-stale", "m-stale", hoursAgo(12), hoursAgo(12));
    insert.run("v-recent", "m-recent", hoursAgo(1), hoursAgo(1));

    expect(closeStaleVisits(8, TENANT)).toBe(1);

    const stale = db.prepare("SELECT checked_out_at FROM visits WHERE id = 'v-stale'").get() as {
      checked_out_at: string | null;
    };
    const recent = db.prepare("SELECT checked_out_at FROM visits WHERE id = 'v-recent'").get() as {
      checked_out_at: string | null;
    };

    expect(stale.checked_out_at).not.toBeNull();
    expect(recent.checked_out_at).toBeNull();
  });
});
