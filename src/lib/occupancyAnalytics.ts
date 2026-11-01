import type { OccupancyAnalytics, OccupancyDayPoint } from "@/types";

const DAYS: Array<{ day: string; dayGreek: string; short: string }> = [
  { day: "Monday", dayGreek: "Δευτέρα", short: "Δευ" },
  { day: "Tuesday", dayGreek: "Τρίτη", short: "Τρι" },
  { day: "Wednesday", dayGreek: "Τετάρτη", short: "Τετ" },
  { day: "Thursday", dayGreek: "Πέμπτη", short: "Πεμ" },
  { day: "Friday", dayGreek: "Παρασκευή", short: "Παρ" },
  { day: "Saturday", dayGreek: "Σάββατο", short: "Σαβ" },
  { day: "Sunday", dayGreek: "Κυριακή", short: "Κυρ" },
];

const DAY_INDEX = new Map(DAYS.map((entry, index) => [entry.day, index]));

interface VisitInterval {
  checked_in_at: string;
  checked_out_at: string | null;
}

// Converts UTC visit intervals into local weekday/hour buckets and returns the
// average number of people present during each hour across `weeks` weeks.
// A 30-minute presence contributes 0.5 to its hour bucket.
export function computeOccupancyAnalytics(
  visits: VisitInterval[],
  weeks: number,
  capacity: number,
  timezone = "Europe/Athens",
  now = new Date()
): OccupancyAnalytics {
  const safeWeeks = Math.min(52, Math.max(1, Math.round(weeks || 8)));
  const nowMs = now.getTime();
  const sinceMs = nowMs - safeWeeks * 7 * 24 * 60 * 60 * 1000;

  let safeTimezone = timezone;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      hour12: false,
    });
  } catch {
    safeTimezone = "Europe/Athens";
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTimezone,
      weekday: "long",
      hour: "2-digit",
      hour12: false,
    });
  }

  const localBucket = (timestamp: number): { day: number; hour: number } | null => {
    const parts = formatter.formatToParts(new Date(timestamp));
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hourValue = parts.find((part) => part.type === "hour")?.value;
    if (!weekday || !hourValue) return null;

    const day = DAY_INDEX.get(weekday);
    if (day === undefined) return null;

    const hour = Number(hourValue) % 24;
    if (!Number.isFinite(hour)) return null;
    return { day, hour };
  };

  const minuteTotals = DAYS.map(() => Array.from({ length: 24 }, () => 0));

  for (const visit of visits) {
    const rawStart = Date.parse(visit.checked_in_at);
    // Open visits are capped at the 8-hour stale window so a forgotten
    // check-out cannot dominate the historical averages.
    const rawEnd = visit.checked_out_at
      ? Date.parse(visit.checked_out_at)
      : Math.min(nowMs, rawStart + 8 * 60 * 60 * 1000);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;

    const start = Math.max(rawStart, sinceMs);
    const end = Math.min(rawEnd, nowMs);
    if (end <= start) continue;

    let cursor = start;
    while (cursor < end) {
      const nextHour = (Math.floor(cursor / 3_600_000) + 1) * 3_600_000;
      const slotEnd = Math.min(end, nextHour);
      const bucket = localBucket(cursor);
      if (bucket) {
        minuteTotals[bucket.day][bucket.hour] += (slotEnd - cursor) / 60_000;
      }
      cursor = slotEnd;
    }
  }

  const days: OccupancyDayPoint[] = DAYS.map((entry, dayIndex) => ({
    ...entry,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      avg: Math.round((minuteTotals[dayIndex][hour] / 60 / safeWeeks) * 10) / 10,
    })),
  }));

  return {
    weeks: safeWeeks,
    since: new Date(sinceMs).toISOString(),
    capacity: Math.max(0, capacity),
    timezone: safeTimezone,
    days,
  };
}
