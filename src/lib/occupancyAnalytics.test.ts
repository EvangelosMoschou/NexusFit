import { describe, expect, it } from "vitest";
import { computeOccupancyAnalytics } from "./occupancyAnalytics";

const now = new Date("2026-01-15T12:00:00.000Z");

describe("occupancy analytics", () => {
  it("averages presence minutes into weekday/hour buckets", () => {
    const result = computeOccupancyAnalytics(
      [
        {
          checked_in_at: "2026-01-12T10:00:00.000Z",
          checked_out_at: "2026-01-12T11:00:00.000Z",
        },
        {
          checked_in_at: "2026-01-05T10:00:00.000Z",
          checked_out_at: "2026-01-05T11:00:00.000Z",
        },
        {
          checked_in_at: "2026-01-13T10:00:00.000Z",
          checked_out_at: "2026-01-13T10:30:00.000Z",
        },
      ],
      2,
      80,
      "UTC",
      now
    );

    expect(result.weeks).toBe(2);
    expect(result.capacity).toBe(80);
    const monday = result.days.find((day) => day.day === "Monday");
    const tuesday = result.days.find((day) => day.day === "Tuesday");
    expect(monday?.hours[10].avg).toBe(1);
    expect(tuesday?.hours[10].avg).toBe(0.3);
    expect(monday?.hours[10].avg).toBeGreaterThan(0);
  });

  it("splits a visit that crosses an hour boundary", () => {
    const result = computeOccupancyAnalytics(
      [
        {
          checked_in_at: "2026-01-12T10:30:00.000Z",
          checked_out_at: "2026-01-12T11:30:00.000Z",
        },
      ],
      1,
      50,
      "UTC",
      now
    );

    const monday = result.days.find((day) => day.day === "Monday");
    expect(monday?.hours[10].avg).toBe(0.5);
    expect(monday?.hours[11].avg).toBe(0.5);
  });

  it("ignores future and invalid visits", () => {
    const result = computeOccupancyAnalytics(
      [
        {
          checked_in_at: "2026-01-20T10:00:00.000Z",
          checked_out_at: "2026-01-20T11:00:00.000Z",
        },
        {
          checked_in_at: "invalid",
          checked_out_at: null,
        },
      ],
      2,
      40,
      "UTC",
      now
    );

    expect(result.days.every((day) => day.hours.every((hour) => hour.avg === 0))).toBe(
      true
    );
  });
});
