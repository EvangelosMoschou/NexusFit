"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BarChart3, Clock3, Lock } from "lucide-react";
import type { OccupancyAnalytics } from "@/types";

interface ForecastResponse extends Partial<OccupancyAnalytics> {
  success: boolean;
  locked?: boolean;
  error?: string;
}

function todayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export const OccupancyForecast: React.FC = () => {
  const [data, setData] = useState<OccupancyAnalytics | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayIndex);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/occupancy/analytics?weeks=8", {
        cache: "no-store",
      });
      const json = (await res.json()) as ForecastResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Δεν ήταν δυνατή η φόρτωση της πρόβλεψης.");
      }

      if (json.locked) {
        setLocked(true);
        setData(null);
        return;
      }

      setLocked(false);
      setData({
        weeks: json.weeks ?? 8,
        since: json.since ?? "",
        capacity: json.capacity ?? 0,
        timezone: json.timezone ?? "Europe/Athens",
        days: json.days ?? [],
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Σφάλμα φόρτωσης της πρόβλεψης."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const day = data?.days[selectedDay];
  const maxAvg = data
    ? Math.max(
        1,
        ...data.days.flatMap((entry) => entry.hours.map((point) => point.avg))
      )
    : 1;

  const activeHours = day
    ? day.hours.filter((point) => point.avg > 0)
    : [];
  const quietestHour =
    activeHours.length > 0
      ? activeHours.reduce((best, point) => (point.avg < best.avg ? point : best))
      : null;
  const busiestHour =
    activeHours.length > 0
      ? activeHours.reduce((best, point) => (point.avg > best.avg ? point : best))
      : null;

  return (
    <div className="p-5 rounded-xl bg-surface border border-border space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-primary flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent" />
            Πρόβλεψη Πληρότητας
          </h3>
          <p className="text-[11px] text-secondary mt-1">
            Μέσος όρος ατόμων ανά ώρα από τις τελευταίες {data?.weeks ?? 8}{" "}
            εβδομάδες. Διάλεξε μέρα για να προγραμματίσεις καλύτερα.
          </p>
        </div>
        <div className="text-[10px] text-tertiary font-mono flex items-center gap-1">
          <Clock3 className="w-3 h-3" />
          {data?.timezone ?? "Europe/Athens"}
        </div>
      </div>

      {loading ? (
        <div className="h-44 rounded-lg bg-background border border-border flex items-center justify-center text-[11px] text-secondary">
          Φόρτωση δεδομένων...
        </div>
      ) : locked ? (
        <div className="p-4 rounded-lg bg-background border border-border flex items-start gap-2 text-[11px] text-secondary">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Η πρόβλεψη πληρότητας είναι διαθέσιμη με Premium συνδρομή.
          </span>
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
          {error}
        </div>
      ) : !data || !day ? (
        <div className="p-5 text-center text-[11px] text-secondary">
          Δεν υπάρχουν ακόμη αρκετά δεδομένα.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {data.days.map((entry, index) => (
              <button
                key={entry.day}
                type="button"
                onClick={() => setSelectedDay(index)}
                aria-pressed={selectedDay === index}
                title={entry.dayGreek}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  selectedDay === index
                    ? "bg-btn text-btn-ink"
                    : "bg-background border border-border text-secondary hover:text-primary"
                }`}
              >
                {entry.short}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className="flex items-end gap-1 h-44">
                {day.hours.map((point) => (
                  <div
                    key={point.hour}
                    className="flex-1 h-full flex flex-col justify-end items-center gap-1"
                    title={`${day.dayGreek} ${hourLabel(point.hour)} — ${point.avg} άτομα`}
                    aria-label={`${day.dayGreek} ${hourLabel(point.hour)}: ${point.avg} άτομα`}
                  >
                    <div
                      className={`w-full rounded-t transition-colors ${
                        point.avg > 0 ? "bg-accent" : "bg-border/70"
                      }`}
                      style={{
                        height: `${Math.max(2, (point.avg / maxAvg) * 100)}%`,
                      }}
                    />
                    <span className="text-[9px] text-tertiary font-mono">
                      {point.hour % 3 === 0 ? point.hour : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {activeHours.length === 0 ? (
            <p className="text-[11px] text-tertiary text-center">
              Δεν υπάρχουν καταγραφές για αυτή τη μέρα ακόμη.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-secondary">
              <span>
                Πιο ήσυχα:{" "}
                <strong className="text-emerald-400">
                  {hourLabel(quietestHour?.hour ?? 0)}
                </strong>{" "}
                ({quietestHour?.avg ?? 0} άτομα)
              </span>
              <span>
                Πιο γεμάτα:{" "}
                <strong className="text-amber-300">
                  {hourLabel(busiestHour?.hour ?? 0)}
                </strong>{" "}
                ({busiestHour?.avg ?? 0} άτομα)
              </span>
              <span className="text-tertiary">
                Χωρητικότητα: {data.capacity}
              </span>
            </div>
          )}
          <p className="text-[10px] text-tertiary">
            Οι μπάρες δείχνουν σχετικό μέσο όρο· μια παρουσία 30 λεπτών μετράει
            ως μισό άτομο στην ώρα της.
          </p>
        </>
      )}
    </div>
  );
};
