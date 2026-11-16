/**
 * Legend for one floor.
 *
 * Design doc §6: the legend is never a row of bare colour chips — every entry
 * carries a swatch (with its pattern), the 1–3 character short label, the full
 * category name and the square count, and the fixed void entry is always
 * present. That is what makes the plan readable in greyscale and in print.
 */

import React from "react";
import { patternToBackground, type LegendEntry } from "@/modules/gym-floor-plan";
import { CELL_BASE_STYLE } from "@/components/floor-plan/cellStyle";
import { formatSquareCount } from "@/components/floor-plan/labels";

interface FloorPlanLegendProps {
  entries: readonly LegendEntry[];
  /** Hidden from sight but available to screen readers (public figure). */
  visuallyHidden?: boolean;
  className?: string;
  /** Marks the active entry in the editor's legend-as-brush-picker. */
  activeId?: string | null;
  onSelect?: (entry: LegendEntry) => void;
}

interface LegendSwatchProps {
  entry: Pick<LegendEntry, "color" | "inkColor" | "shortLabel" | "pattern">;
  size?: number;
}

/** One square of the plan, reduced to a chip. Shares the cell geometry. */
export const LegendSwatch: React.FC<LegendSwatchProps> = ({ entry, size = 22 }) => {
  const pattern = patternToBackground(entry.pattern, entry.inkColor);
  return (
    <span
      aria-hidden="true"
      style={{
        ...CELL_BASE_STYLE,
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: 3,
        border: "1px solid var(--fp-grid-line)",
        backgroundColor: entry.color,
        color: entry.inkColor,
        backgroundImage: pattern.backgroundImage,
        ...(pattern.backgroundSize === undefined ? {} : { backgroundSize: pattern.backgroundSize }),
      }}
    >
      {entry.shortLabel}
    </span>
  );
};

export const FloorPlanLegend: React.FC<FloorPlanLegendProps> = ({
  entries,
  visuallyHidden = false,
  className,
  activeId = null,
  onSelect,
}) => {
  const interactive = typeof onSelect === "function";

  return (
    <ul
      className={[
        visuallyHidden ? "sr-only" : "grid grid-cols-1 sm:grid-cols-2 gap-1.5",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Υπόμνημα κάτοψης"
    >
      {entries.map((entry) => {
        const isActive = activeId === entry.id;
        const body = (
          <>
            <LegendSwatch entry={entry} />
            <span className="font-mono font-bold text-[10px] text-tertiary w-6 shrink-0">
              {entry.shortLabel}
            </span>
            <span className="text-primary flex-1 min-w-0 truncate">{entry.name}</span>
            <span className="text-tertiary font-mono text-[10px] shrink-0">
              {formatSquareCount(entry.count)}
            </span>
          </>
        );

        const itemClass = [
          "flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs border",
          isActive ? "border-accent bg-accent/10" : "border-transparent",
        ].join(" ");

        return (
          <li key={`${entry.kind}:${entry.id}`} className="list-none">
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelect(entry)}
                aria-pressed={isActive}
                className={`${itemClass} w-full text-left hover:border-border-light transition-colors`}
              >
                {body}
              </button>
            ) : (
              <span className={itemClass}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
};
