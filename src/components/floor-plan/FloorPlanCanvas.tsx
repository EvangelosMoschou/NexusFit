"use client";

/**
 * Floor plan renderer, shared by the public view and the editor.
 *
 * ## Why SVG (decided; not re-litigated here)
 *
 * The previous renderer mapped `buildFloorRenderModel(...).cells` into a CSS
 * Grid: one `<div>` per square, so a 96 × 96 floor was 9 216 DOM nodes inside a
 * figure the user perceives as a single picture. This component draws the same
 * floor as ONE `<svg>` whose cost is proportional to the number of *distinct
 * appearances* (at most `maxCategories + 3` = 23), not to the number of squares:
 *
 *   | Floor   | Squares | CSS-Grid nodes | SVG nodes |
 *   | ------- | ------- | -------------- | --------- |
 *   | 40 × 40 | 1 600   | 1 601          | < 30      |
 *   | 96 × 96 | 9 216   | 9 217          | < 40      |
 *
 * `viewBox` + `preserveAspectRatio` keep squares square at any container width,
 * which is the other reason CSS Grid struggled at large grids.
 *
 * ## Hit-testing
 *
 * The editor paints by dragging. There is exactly ONE `pointerdown` and ONE
 * `pointerover` handler, both on the `<svg>`, and both go through
 * `cellAtPoint(clientX, clientY, rect, rows, cols)` — pure coordinate maths
 * against `getBoundingClientRect()`. No per-square listener exists because no
 * per-square node exists. The maths mirrors `preserveAspectRatio="xMidYMid
 * meet"`, so it stays exact on a container that is not exactly `cols / rows`.
 *
 * ## Accessibility
 *
 * `renderSvg.ts` owns the contract and this component only renders it:
 *
 *   - the map is ONE image (`role="img"`) named by `describeFloor`'s summary;
 *   - the summary is emitted exactly once (the `aria-label`), never repeated on
 *     a wrapper or in a caption;
 *   - no per-square node carries a label, role or tab stop;
 *   - the legend stays a sibling DOM list, exactly one per plan, rendered by the
 *     caller through `legendMode`.
 *
 * In the editor the `<svg>` itself is the focus target (`tabIndex=-1`, so it is
 * click-focusable but not a tab stop): it holds `onKeyDown` and the roving
 * cursor. The cursor's focus ring is drawn INSIDE the SVG as a
 * non-scaling-stroke rect, because there is no per-square DOM node that could
 * carry `:focus-visible`.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildFloorRenderModel,
  type FloorPlanLabels,
  type FloorPlanTheme,
  type GymFloorPlan,
} from "@/modules/gym-floor-plan";
import {
  buildSvgScene,
  cellAtPoint,
  cellSetPath,
  type CellCoord,
  type SvgScene,
  type SvgTileShape,
} from "@/modules/gym-floor-plan/renderSvg";
import { cellKey, strokePreviewFill, themeVariablesStyle } from "@/components/floor-plan/cellStyle";
import { FloorPlanLegend } from "@/components/floor-plan/FloorPlanLegend";

/** Live preview of the stroke currently under the pointer, before it commits. */
export interface StrokePreview {
  keys: ReadonlySet<string>;
  style: React.CSSProperties;
  label: string;
}

/**
 * Colour applied to the in-progress stroke.
 */
/** Focus ring geometry, in cell units. Non-scaling, so it stays 2px on screen. */
const FOCUS_RING_INSET = 0.12;
const FOCUS_RING_STROKE_WIDTH = 2;

/** Seed width before the first measurement; the plan's content column on a laptop. */
const DEFAULT_MEASURED_WIDTH = 720;

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
  /** Roving cursor: exactly one square is highlighted, and it is inside the SVG. */
  focusRow?: number;
  focusCol?: number;
  /** Painted-but-not-yet-committed stroke feedback. */
  strokePreview?: StrokePreview | null;
  /** The element that receives DOM focus and `onKeyDown` in the editor. */
  /** Receives the map element so the caller can move focus to it. */
  gridRef?: React.Ref<SVGSVGElement>;
  gridProps?: React.SVGProps<SVGSVGElement>;
  /** Pointer entry point: `(row, col, event)` for a press inside the grid. */
  onCellPointerDown?: (row: number, col: number, event: React.PointerEvent<SVGSVGElement>) => void;
  /** Pointer move inside the grid; the editor decides whether a stroke is open. */
  onCellPointerOver?: (row: number, col: number, event: React.PointerEvent<SVGSVGElement>) => void;
}

/** One `<pattern>` def, rendered without per-square nodes. */
const PatternDef: React.FC<{ scene: SvgScene; tile: SvgScene["patterns"][number] }> = ({
  scene,
  tile,
}) => {
  const shapeProps = (shape: SvgTileShape) => ({
    stroke: shape.kind === "circle" ? "none" : tile.inkColor,
    fill: shape.kind === "circle" ? tile.inkColor : "none",
    strokeWidth: "strokeWidth" in shape ? shape.strokeWidth : undefined,
    vectorEffect: "non-scaling-stroke" as const,
  });

  return (
    <pattern
      id={tile.id}
      patternUnits="userSpaceOnUse"
      width={tile.width}
      height={tile.height}
      opacity={tile.opacity}
    >
      {tile.shapes.map((shape, index) => {
        if (shape.kind === "circle") {
          return (
            <circle
              key={`${tile.id}-${index}`}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              fill={tile.inkColor}
            />
          );
        }
        if (shape.kind === "line") {
          return (
            <line
              key={`${tile.id}-${index}`}
              x1={shape.x1}
              y1={shape.y1}
              x2={shape.x2}
              y2={shape.y2}
              {...shapeProps(shape)}
            />
          );
        }
        return <path key={`${tile.id}-${index}`} d={shape.d} {...shapeProps(shape)} fill="none" />;
      })}
      <title>{`pattern for ${scene.floorName}`}</title>
    </pattern>
  );
};

/** One `<pattern>` def that stamps a short label into every square it fills. */
const LabelDef: React.FC<{ tile: SvgScene["labelTiles"][number] }> = ({ tile }) => (
  <pattern id={tile.id} patternUnits="userSpaceOnUse" width={1} height={1}>
    <text
      x={0.5}
      y={0.5}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={tile.fontSize}
      fontWeight={700}
      fill={tile.inkColor}
    >
      {tile.text}
    </text>
  </pattern>
);

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
  onCellPointerDown,
  onCellPointerOver,
}) => {
  // The map element. The caller supplies the ref (the editor focuses it), so
  // there is exactly one ref and React itself assigns it — nothing writes into a
  // prop, which is what `react-hooks/immutability` rejects.
  const ownRef = useRef<SVGSVGElement | null>(null);
  const svgRef = (gridRef as React.RefObject<SVGSVGElement | null>) ?? ownRef;
  /**
   * Measured width of the map in CSS pixels.
   *
   * The label threshold is a *pixel* rule ("draw a 1–3 character label only when
   * a square is at least 16px"), so assuming a width would make it meaningless:
   * the same 96 × 96 floor is legible on a 1600px monitor and a smear in a 320px
   * column. The scene is built from this measured value, seeded at 720px so the
   * first paint (and any non-layout environment) has a sane, deterministic
   * answer.
   */
  const [measuredWidth, setMeasuredWidth] = useState(DEFAULT_MEASURED_WIDTH);

  useEffect(
    () => {
      const element = svgRef.current;
      if (!element) return;

      const measure = (width: number) => {
        if (!Number.isFinite(width) || width <= 0) return;
        // Quantise to whole pixels: a sub-pixel resize must not rebuild the scene.
        const whole = Math.round(width);
        setMeasuredWidth((current) => (current === whole ? current : whole));
      };

      measure(element.getBoundingClientRect().width);

      // `ResizeObserver` is available in every browser this app targets but not in
      // jsdom, so its absence is a supported state (the seeded width is used)
      // rather than an error.
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) measure(entry.contentRect.width);
      });
      observer.observe(element);
      return () => observer.disconnect();
      // The observed node is the element mounted once for this component's life.
      // `svgRef` is derived from a prop, so depending on it would tear down and
      // rebuild the observer on an unrelated caller re-render.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const model = useMemo(
    () => buildFloorRenderModel(plan, floorId, theme, labels),
    [plan, floorId, theme, labels]
  );

  // The scene depends only on the floor's shape and its appearance table, so it
  // does NOT re-derive while a stroke preview changes: the preview is a separate
  // layer drawn over the same paths.
  const scene = useMemo(
    () =>
      buildSvgScene(model, {
        // Labels are sized from the column width, and the SVG fills its column,
        // so the scene needs a nominal width to decide legibility. The real
        // width is applied by CSS; this only chooses whether a label is legible.
        widthPx: measuredWidth,
        idPrefix: `fp-${model.floorId}`,
      }),
    [model, measuredWidth]
  );

  /** Resolves a pointer event to a square via the element's rendered box. */
  const coordFromEvent = (event: React.PointerEvent<SVGSVGElement>): CellCoord | null => {
    const element = svgRef.current ?? event.currentTarget;
    if (!element) return null;
    return cellAtPoint(
      event.clientX,
      event.clientY,
      element.getBoundingClientRect(),
      scene.rows,
      scene.cols
    );
  };

  const previewPath = useMemo(() => {
    if (!interactive || strokePreview === null || strokePreview.keys.size === 0) return null;
    const cells: CellCoord[] = [];
    for (const key of strokePreview.keys) {
      const [row, col] = key.split(":");
      cells.push({ row: Number(row), col: Number(col) });
    }
    const path = cellSetPath(cells, scene.rows, scene.cols);
    return path.d === "" ? null : path;
  }, [interactive, strokePreview, scene.rows, scene.cols]);

  const ringRow = Math.min(Math.max(0, focusRow), Math.max(0, scene.rows - 1));
  const ringCol = Math.min(Math.max(0, focusCol), Math.max(0, scene.cols - 1));
  const showFocusRing = interactive;

  /**
   * The ONE square the roving cursor is on.
   *
   * `describeCell` derives `ariaLabel`/`tooltip` for a single coordinate instead
   * of pre-allocating them for all `rows * cols` squares — that is the whole
   * point of splitting the packed model from the renderer. It is memoised on the
   * cursor, so moving the cursor costs one string pair, not 9 216.
   */
  const cursor = useMemo(() => {
    if (!interactive) return null;
    return model.describeCell(ringRow, ringCol);
  }, [interactive, model, ringRow, ringCol]);

  const {
    onPointerDown: externalPointerDown,
    onPointerOver: externalPointerOver,
    style: externalStyle,
    ...restGridProps
  } = gridProps ?? {};

  return (
    <div
      className={["space-y-3", className ?? ""].filter(Boolean).join(" ")}
      style={themeVariablesStyle(theme)}
      {...(printRoot ? { "data-floor-plan-root": true } : {})}
    >
      <figure
        // ONE accessible object. The summary is the figure's name and is
        // intentionally not repeated anywhere else in the subtree.
        role={interactive ? "group" : "img"}
        aria-label={scene.accessibility.label}
        data-floor-plan-figure
        className="m-0 rounded-xl border border-border bg-surface p-3 sm:p-4"
      >
        <svg
          ref={gridRef ?? ownRef}
          {...restGridProps}
          viewBox={scene.viewBox}
          preserveAspectRatio="xMidYMid meet"
          // The empty/void theme colours arrive as `--fp-*` custom properties so
          // a single print stylesheet swap re-themes the map; `style` resolves
          // them where a presentation attribute would not.
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            aspectRatio: `${scene.cols} / ${scene.rows}`,
            background: "var(--fp-surface)",
            touchAction: interactive ? "none" : undefined,
            ...(externalStyle ?? {}),
          }}
          data-floor-plan-svg
          data-rows={scene.rows}
          data-cols={scene.cols}
          // The public map is decorative ON TOP OF the figure's own name, so it
          // is hidden; the editor is interactive and must stay in the tree.
          aria-hidden={interactive ? undefined : true}
          {...(interactive
            ? {
                tabIndex: -1,
                role: "application",
                // Points at the visually-hidden live region below, so a screen
                // reader knows which square the cursor is on without 9 216
                // labelled nodes existing.
                "aria-describedby": `${scene.floorId}-cursor`,
              }
            : {})}
          onPointerDown={(event) => {
            externalPointerDown?.(event);
            if (!interactive || !onCellPointerDown) return;
            const point = coordFromEvent(event);
            if (point) onCellPointerDown(point.row, point.col, event);
          }}
          onPointerOver={(event) => {
            // `pointerover` bubbles (unlike `pointerenter`), so one listener on
            // the root covers every square without any per-square node.
            externalPointerOver?.(event);
            if (!interactive || !onCellPointerOver) return;
            const point = coordFromEvent(event);
            if (point) onCellPointerOver(point.row, point.col, event);
          }}
        >
          {/* No <title>: the figure's `aria-label` is already the accessible
              name, and a <title> here would name the map a second time. The
              <desc> carries the legend mapping plus, in the editor, the ONE
              square the roving cursor is on — derived on demand by
              `describeCell`, never pre-allocated for 9 216 squares. */}
          <desc>{scene.accessibility.description}</desc>

          <defs>
            {scene.patterns.map((tile) => (
              <PatternDef key={tile.id} scene={scene} tile={tile} />
            ))}
            {scene.labelTiles.map((tile) => (
              <LabelDef key={tile.id} tile={tile} />
            ))}
          </defs>

          {/* One shape per appearance — never one per square. */}
          {scene.layers.map((layer) => (
            <path key={layer.appearanceIndex} d={layer.d} fill={layer.fill} />
          ))}

          {showFocusRing ? null : null}

          {scene.labelLayers.map((layer) => (
            <path key={`label-${layer.appearanceIndex}`} d={layer.d} fill={layer.fill} />
          ))}

          {/* ONE path for the whole grid, at a hairline that does not scale. */}
          {scene.gridLines !== "" && (
            <path
              d={scene.gridLines}
              fill="none"
              // `style`, not `stroke=`: SVG presentation attributes do not
              // substitute `var()`, so the attribute form would draw nothing.
              style={{ stroke: "var(--fp-grid-line)" }}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}

          {/* Live stroke preview: one merged path for the whole drag. */}
          {previewPath !== null && strokePreview !== null && (
            <path
              d={previewPath.d}
              style={{ fill: strokePreviewFill(strokePreview.style) }}
              opacity={0.75}
              pointerEvents="none"
              data-stroke-preview
            />
          )}

          {/* Roving cursor ring. Drawn inside the viewBox because there is no
              per-square DOM node that could carry `:focus-visible`. */}
          {showFocusRing && (
            <g data-focus-ring pointerEvents="none">
              {/* Two-tone ring. A single-colour ring can disappear on a square
                  of the same colour, and this cursor sits on top of an
                  owner-chosen fill, so it is drawn as a light outer ring with a
                  dark inner ring — the same trick a CSS `outline` + `box-shadow`
                  pair uses. Both are `non-scaling-stroke`, so they stay 3px and
                  1.5px on screen whether the floor is 3 × 4 or 96 × 96. */}
              <rect
                data-focus-ring-outer
                x={ringCol + FOCUS_RING_INSET}
                y={ringRow + FOCUS_RING_INSET}
                width={1 - FOCUS_RING_INSET * 2}
                height={1 - FOCUS_RING_INSET * 2}
                fill="none"
                style={{ stroke: "var(--fp-surface)" }}
                strokeWidth={FOCUS_RING_STROKE_WIDTH + 1}
                vectorEffect="non-scaling-stroke"
                rx={0.06}
              />
              <rect
                data-focus-ring-inner
                x={ringCol + FOCUS_RING_INSET}
                y={ringRow + FOCUS_RING_INSET}
                width={1 - FOCUS_RING_INSET * 2}
                height={1 - FOCUS_RING_INSET * 2}
                fill="none"
                style={{ stroke: "var(--fp-ink)" }}
                strokeWidth={FOCUS_RING_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
                rx={0.06}
              />
            </g>
          )}
        </svg>

        {interactive && (
          // One polite live region per plan: arrow-key moves announce the square
          // the cursor landed on. `cursor.ariaLabel` is derived for this square
          // only — never for the whole floor.
          <p id={`${scene.floorId}-cursor`} aria-live="polite" className="sr-only">
            {cursor?.ariaLabel ?? ""}
          </p>
        )}

        <figcaption className="mt-2 flex items-center justify-between gap-2 text-[10px] text-tertiary font-mono">
          <span>{scene.floorName}</span>
          <span>
            {scene.rows} × {scene.cols}
          </span>
        </figcaption>
      </figure>

      {legendMode === "visible" && <FloorPlanLegend entries={model.legend} />}
      {legendMode === "sr-only" && <FloorPlanLegend entries={model.legend} visuallyHidden />}
    </div>
  );
};

/** Re-exported so an editor can key a stroke without importing two modules. */
export { cellKey };
