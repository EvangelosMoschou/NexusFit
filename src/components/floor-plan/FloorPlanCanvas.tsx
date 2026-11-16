"use client";

/**
 * Floor grid renderer, shared by the public view and the editor.
 *
 * One `buildFloorRenderModel` call per floor, mapped into a CSS Grid. The design
 * document (§4) picks CSS Grid over SVG/canvas for native focus, hit-testing,
 * text labels and print; §6 requires the public floor to be exposed as ONE image
 * with `describeFloor` as its accessible name, so a 40 × 40 plan is not 1 600
 * tab stops.
 *
 * Pointer and keyboard handling are delegated to the grid container rather than
 * attached to each of up to 1 600 squares: one listener instead of thousands, and
 * the handlers read `data-row`/`data-col` from the event target. That is also why
 * `gridProps` is exposed — the editor passes its handlers in through it, while
 * the public view passes none.
 */

import React, { useMemo } from "react";
import {
  buildFloorRenderModel,
  type FloorPlanLabels,
  type FloorPlanTheme,
  type GymFloorPlan,
} from "@/modules/gym-floor-plan";
import {
  cellStyle,
  gridContainerStyle,
  themeVariablesStyle,
} from "@/components/floor-plan/cellStyle";
import { FloorPlanLegend } from "@/components/floor-plan/FloorPlanLegend";

/** Live preview of the stroke currently under the pointer, before it commits. */
export interface StrokePreview {
  keys: ReadonlySet<string>;
  style: React.CSSProperties;
  label: string;
}

interface FloorPlanCanvasProps {
  plan: GymFloorPlan;
  floorId: string;
  theme: FloorPlanTheme;
  labels: FloorPlanLabels;
  /**
   * Where the legend lives.
   *
   * Exactly one legend must exist per plan: a visible one under the grid
   * (`"visible"`), a screen-reader-only one (`"sr-only"`), or none at all
   * (`"none"`) when the surrounding layout renders it elsewhere (the public
   * aside, the editor sidebar). Two copies would duplicate every category name
   * in the accessibility tree.
   */
  legendMode?: "visible" | "sr-only" | "none";
  /** Marks the root so the print stylesheet can retheme it. */
  printRoot?: boolean;
  className?: string;
  /** The editor sets this; the public view leaves every handler off. */
  interactive?: boolean;
  /** Roving tabindex: exactly one square is in the tab order at a time. */
  focusRow?: number;
  focusCol?: number;
  /** Painted-but-not-yet-committed stroke feedback. */
  strokePreview?: StrokePreview | null;
  gridRef?: React.Ref<HTMLDivElement>;
  gridProps?: React.HTMLAttributes<HTMLDivElement>;
}

export const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({
  plan,
  floorId,
  theme,
  labels,
  legendMode = "sr-only",
  printRoot = true,
  className,
  interactive = false,
  focusRow = 0,
  focusCol = 0,
  strokePreview = null,
  gridRef,
  gridProps,
}) => {
  const model = useMemo(
    () => buildFloorRenderModel(plan, floorId, theme, labels),
    [plan, floorId, theme, labels]
  );

  return (
    <div
      className={["space-y-3", className ?? ""].filter(Boolean).join(" ")}
      style={themeVariablesStyle(theme)}
      {...(printRoot ? { "data-floor-plan-root": true } : {})}
    >
      <figure
        role={interactive ? "group" : "img"}
        aria-label={model.summary}
        className="m-0 rounded-xl border border-border bg-surface p-3 sm:p-4"
      >
        <div
          ref={gridRef}
          {...gridProps}
          // The figure's `aria-label` is the whole description, so the decorative
          // public squares stay out of the accessibility tree. The editor grid is
          // interactive and keeps every square focusable and announced.
          aria-hidden={interactive ? undefined : true}
          style={{
            ...gridContainerStyle(model.grid),
            ...(gridProps?.style ?? {}),
            ...(interactive ? { touchAction: "none" as const } : {}),
          }}
        >
          {model.cells.map((cell) => {
            const key = `${cell.row}:${cell.col}`;

            if (!interactive) {
              return (
                <div key={key} style={cellStyle(cell)} data-row={cell.row} data-col={cell.col}>
                  {cell.shortLabel}
                </div>
              );
            }

            const inStroke = strokePreview?.keys.has(key) ?? false;
            const isFocusTarget = cell.row === focusRow && cell.col === focusCol;
            return (
              <div
                key={key}
                role="button"
                tabIndex={isFocusTarget ? 0 : -1}
                aria-label={cell.ariaLabel}
                title={cell.tooltip}
                data-row={cell.row}
                data-col={cell.col}
                data-kind={cell.kind}
                data-stroke={inStroke ? "true" : undefined}
                style={{
                  ...(inStroke && strokePreview ? strokePreview.style : cellStyle(cell)),
                  cursor: "crosshair",
                }}
              >
                {inStroke && strokePreview ? strokePreview.label : cell.shortLabel}
              </div>
            );
          })}
        </div>

        <figcaption className="mt-2 flex items-center justify-between gap-2 text-[10px] text-tertiary font-mono">
          <span>{model.floorName}</span>
          <span>
            {model.rows} × {model.cols}
          </span>
        </figcaption>
      </figure>

      {legendMode === "visible" && <FloorPlanLegend entries={model.legend} />}
      {legendMode === "sr-only" && <FloorPlanLegend entries={model.legend} visuallyHidden />}
    </div>
  );
};
