"use client";

import React, { useMemo, useState } from "react";
import { Dumbbell, Search } from "lucide-react";
import { exercisesDatabase } from "@/data/exercisesData";
import { difficultyLabel, equipmentLabel, muscleGroupLabel } from "@/lib/format";

const GROUP_ORDER = ["chest", "back", "legs", "shoulders", "arms", "core"];

export const Exercises: React.FC = () => {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");

  const groups = useMemo(
    () => GROUP_ORDER.filter((value) => exercisesDatabase.some((ex) => ex.muscleGroup === value)),
    []
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exercisesDatabase.filter((ex) => {
      if (group !== "all" && ex.muscleGroup !== group) return false;
      if (!needle) return true;
      return (
        ex.greekName.toLowerCase().includes(needle) ||
        ex.name.toLowerCase().includes(needle) ||
        ex.targetMuscles.some((muscle) => muscle.toLowerCase().includes(needle))
      );
    });
  }, [query, group]);

  return (
    <section id="exercises" className="py-16 border-b border-border bg-surface/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <span className="text-[11px] font-mono text-accent uppercase font-bold">
              Βιβλιοθήκη Ασκήσεων
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight mt-1">
              Ασκήσεις & Τεχνική
            </h2>
            <p className="text-secondary text-xs sm:text-sm mt-1">
              Οι ασκήσεις του προγράμματος με μυϊκή ομάδα, εξοπλισμό και βασικές οδηγίες.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-tertiary absolute left-3 top-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Αναζήτηση άσκησης..."
              aria-label="Αναζήτηση άσκησης"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-background border border-border text-primary text-xs outline-none focus:border-border-light"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-6">
          <button
            type="button"
            onClick={() => setGroup("all")}
            aria-pressed={group === "all"}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              group === "all"
                ? "bg-btn text-btn-ink font-bold"
                : "bg-surface text-secondary hover:text-primary border border-border"
            }`}
          >
            Όλα
          </button>
          {groups.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setGroup(value)}
              aria-pressed={group === value}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                group === value
                  ? "bg-btn text-btn-ink font-bold"
                  : "bg-surface text-secondary hover:text-primary border border-border"
              }`}
            >
              {muscleGroupLabel(value)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
            Δεν βρέθηκαν ασκήσεις για αυτή την αναζήτηση.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((ex) => (
              <article
                key={ex.id}
                className="p-5 rounded-xl bg-surface border border-border space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-lg bg-accent/10 text-accent shrink-0">
                      <Dumbbell className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-primary leading-snug">
                      {ex.greekName}
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono uppercase text-tertiary border border-border rounded px-1.5 py-0.5 whitespace-nowrap">
                    {difficultyLabel(ex.difficulty)}
                  </span>
                </div>

                <div className="text-[11px] text-tertiary">
                  {muscleGroupLabel(ex.muscleGroup)} • {equipmentLabel(ex.equipment)}
                </div>

                <p className="text-xs text-secondary leading-relaxed">{ex.description}</p>
                <p className="text-[10px] text-accent leading-relaxed line-clamp-2">{ex.tips}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
