/**
 * Print stylesheet for the floor plan.
 *
 * Design doc §4: printing forces `PRINT_FLOOR_PLAN_THEME`, keeps one floor per
 * page and needs `print-color-adjust: exact`, because browsers otherwise drop
 * background fills. The short label and the pattern remain the print-safe
 * encodings — never the fill alone.
 *
 * The palette is swapped by redefining the `--fp-*` custom properties that
 * `cellStyle()` reads, so nothing has to re-render for print and the values
 * still come from the module's frozen `PRINT_FLOOR_PLAN_THEME`.
 */

import React from "react";
import { PRINT_FLOOR_PLAN_THEME as PRINT } from "@/modules/gym-floor-plan";
import { FLOOR_PLAN_THEME_CSS_VARIABLES as VARS } from "@/components/floor-plan/cellStyle";

const PRINT_CSS = `
@media print {
  [data-floor-plan-root] {
    ${VARS.surface}: ${PRINT.surfaceColor};
    ${VARS.empty}: ${PRINT.emptyColor};
    ${VARS.gridLine}: ${PRINT.gridLineColor};
    ${VARS.void}: ${PRINT.voidColor};
    ${VARS.ink}: ${PRINT.inkColor};
    ${VARS.mutedInk}: ${PRINT.mutedInkColor};
    background: ${PRINT.surfaceColor};
    color: ${PRINT.inkColor};
  }

  /* One floor per page: never split a plan across a page break. */
  [data-floor-plan-root] figure {
    break-inside: avoid;
    page-break-inside: avoid;
    border-color: ${PRINT.gridLineColor};
    background-color: ${PRINT.surfaceColor};
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  [data-floor-plan-root] figure > div {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  /* The screen-reader legend becomes visible print text. */
  [data-floor-plan-root] .sr-only {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip: auto;
    clip-path: none;
    white-space: normal;
  }

  [data-floor-plan-root] figcaption {
    color: ${PRINT.mutedInkColor};
  }
}
`;

/**
 * Mounted once per plan. `dangerouslySetInnerHTML` is safe here: the string is
 * built at module load from frozen theme constants and contains no user input.
 */
export const FloorPlanPrintStyles: React.FC = () => (
  <style data-floor-plan-print dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
);
