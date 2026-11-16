"use client";

/**
 * Gym floor plan editor — the interactive half of Phase 2.
 *
 * Stateful but with no I/O of its own: `FloorPlanTab` owns the fetch/save
 * boundary and passes the plan plus a change callback in, which keeps this
 * component testable without a server.
 *
 * Three behaviours carry most of the complexity:
 *
 *   1. **One stroke = one update.** Pointer-down starts a stroke, pointer-move
 *      accumulates cells into a ref (with a Bresenham fill so a fast drag does
 *      not leave gaps), and pointer-up applies them in a single `paintCells`
 *      call. Only the visual preview is React state, so dragging across twenty
 *      cells does not re-render the plan twenty times.
 *   2. **Roving tabindex.** Exactly one square is tabbable; arrow keys move the
 *      focus target and Space/Enter paints. A 40 × 40 floor is one tab stop, not
 *      1 600.
 *   3. **Explicit destructive choices.** Resize confirms through
 *      `countCellsOutsideBounds`; category deletion confirms through
 *      `countCategoryUsage` and requires clear-vs-reassign.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Info, Keyboard, PaintBucket, Save, Square, Trash2 } from "lucide-react";
import {
  addCategory,
  addFloor,
  buildLegend,
  countCategoryUsage,
  countCellsOutsideBounds,
  findFloor,
  getInkColor,
  nextId,
  paintCells,
  removeCategory,
  removeFloor,
  renameFloor,
  resizeFloor,
  updateCategory,
  validatePlan,
  type CellCoord,
  type CellPattern,
  type GymFloorPlan,
  type ValidationIssue,
} from "@/modules/gym-floor-plan";
import {
  brushToCell,
  brushesEqual,
  categoryBrush,
  cellKey,
  cellStyle,
  clampToAxis,
  defaultBrush,
  ERASER_BRUSH,
  type Brush,
  VOID_BRUSH,
} from "@/components/floor-plan/cellStyle";
import { FloorPlanCanvas, type StrokePreview } from "@/components/floor-plan/FloorPlanCanvas";
import { FloorPlanPrintStyles } from "@/components/floor-plan/FloorPlanPrintStyles";
import { FloorPlanLegend } from "@/components/floor-plan/FloorPlanLegend";
import { FloorPlanTabs } from "@/components/floor-plan/FloorPlanTabs";
import { CategoryPanel } from "@/components/floor-plan/CategoryPanel";
import { FloorPanel } from "@/components/floor-plan/FloorPanel";
import { GREEK_FLOOR_PLAN_LABELS } from "@/components/floor-plan/labels";
import { useFloorPlanTheme } from "@/components/floor-plan/useFloorPlanTheme";
import { addStrokePoint } from "@/components/floor-plan/stroke";

/** Hotkeys that select a brush without a pointer (design doc §5.2). */
const BRUSH_HOTKEYS = [
  { key: "v", brush: VOID_BRUSH, announce: "Πινέλο: μη διαθέσιμο (τοίχος)" },
  { key: "e", brush: ERASER_BRUSH, announce: "Πινέλο: γόμα" },
] as const;

const ARROW_MOVES: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

interface FloorPlanEditorProps {
  plan: GymFloorPlan;
  onChange: (plan: GymFloorPlan) => void;
  /** Save handler; the tab owns the endpoint and the dirty bookkeeping. */
  onSave: () => void;
  saving?: boolean;
  dirty: boolean;
  /** Validation issues returned by a failed save. */
  serverIssues?: readonly ValidationIssue[];
  /** DELETE /api/admin/floor-plan. */
  onClear: () => void;
  clearing?: boolean;
}

/** Reads `data-row`/`data-col` off the element under the pointer. */
function coordFromTarget(target: EventTarget | null): CellCoord | null {
  if (!(target instanceof HTMLElement)) return null;
  const cell = target.closest<HTMLElement>("[data-row][data-col]");
  if (!cell) return null;
  const row = Number.parseInt(cell.dataset.row ?? "", 10);
  const col = Number.parseInt(cell.dataset.col ?? "", 10);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  return { row, col };
}

export const FloorPlanEditor: React.FC<FloorPlanEditorProps> = ({
  plan,
  onChange,
  onSave,
  saving = false,
  dirty,
  serverIssues = [],
  onClear,
  clearing = false,
}) => {
  const theme = useFloorPlanTheme();
  const [floorId, setFloorId] = useState<string>(plan.floors[0]?.id ?? "floor-1");
  const [brushSelection, setBrush] = useState<Brush>(() => defaultBrush(plan.categories));
  /** Raw cursor position; clamped to the active floor on render. */
  const [pendingFocus, setFocusTarget] = useState<CellCoord>({ row: 0, col: 0 });
  const [strokeCells, setStrokeCells] = useState<ReadonlyMap<string, CellCoord> | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const gridRef = useRef<HTMLDivElement>(null);
  /** Pointer handlers run outside React's render cycle; the stroke lives here. */
  const strokeRef = useRef<Map<string, CellCoord> | null>(null);
  const lastPointRef = useRef<CellCoord | null>(null);
  /** Set right before an arrow-key move so the new square receives focus. */
  const shouldFocusRef = useRef(false);

  // Both the selected floor and the brush are DERIVED, not repaired in an
  // effect: the stored state may outlive its referent (a floor deleted in
  // another tab, a category the owner just removed), and clamping on render is
  // what keeps the cursor, the tab and the brush in sync without a cascading
  // render pass.
  const activeFloor = findFloor(plan, floorId) ?? plan.floors[0];
  const activeFloorId = activeFloor.id;

  const focusTarget = useMemo(
    () => ({
      row: clampToAxis(pendingFocus.row, activeFloor.rows),
      col: clampToAxis(pendingFocus.col, activeFloor.cols),
    }),
    [pendingFocus, activeFloor.rows, activeFloor.cols]
  );

  const brush = useMemo<Brush>(() => {
    if (brushSelection.kind !== "machine") return brushSelection;
    const known = plan.categories.some((category) => category.id === brushSelection.categoryId);
    if (known) return brushSelection;
    return defaultBrush(plan.categories);
  }, [brushSelection, plan.categories]);

  // Move DOM focus to the roving square after a keyboard navigation.
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    const cell = gridRef.current?.querySelector<HTMLElement>(
      `[data-row="${focusTarget.row}"][data-col="${focusTarget.col}"]`
    );
    cell?.focus({ preventScroll: true });
  }, [focusTarget]);

  const validation = useMemo(() => validatePlan(plan), [plan]);
  const issues = useMemo(
    () => [...validation.errors, ...serverIssues],
    [validation.errors, serverIssues]
  );

  const brushLabel = useMemo(() => {
    if (brush.kind === "empty") return "Γόμα (ελεύθερος χώρος)";
    if (brush.kind === "void") return "Μη διαθέσιμο (τοίχος/κολόνα)";
    const category = plan.categories.find((entry) => entry.id === brush.categoryId);
    return category ? `Πινέλο: ${category.name}` : "Πινέλο";
  }, [brush, plan.categories]);

  // The two fixed brushes each drive both `aria-pressed` and two class names;
  // computing them once keeps the three uses from drifting apart.
  const eraserActive = brushesEqual(brush, ERASER_BRUSH);
  const voidActive = brushesEqual(brush, VOID_BRUSH);

  const strokePreview = useMemo<StrokePreview | null>(() => {
    if (!strokeCells || strokeCells.size === 0) return null;
    const cell = brushToCell(brush);
    const category =
      cell.kind === "machine"
        ? plan.categories.find((entry) => entry.id === cell.categoryId)
        : undefined;
    return {
      keys: new Set(strokeCells.keys()),
      style: cellStyle({
        kind: cell.kind,
        color: category?.color ?? "var(--fp-empty)",
        // Same WCAG contrast rule the committed cell will use, so the preview of
        // a white category does not show a white-on-white label.
        inkColor: getInkColor(category?.color ?? "#000000"),
        pattern: "solid",
      }),
      label: category?.shortLabel ?? (cell.kind === "void" ? "×" : ""),
    };
  }, [strokeCells, brush, plan.categories]);

  const legend = useMemo(
    () => buildLegend(plan, activeFloorId, theme, GREEK_FLOOR_PLAN_LABELS),
    [plan, activeFloorId, theme]
  );

  /** Commits the accumulated stroke as ONE model update. */
  const finishStroke = useCallback(() => {
    const pending = strokeRef.current;
    strokeRef.current = null;
    lastPointRef.current = null;
    setStrokeCells(null);
    if (!pending || pending.size === 0) return;
    const coords = [...pending.values()];
    onChange(paintCells(plan, activeFloorId, coords, brushToCell(brush)));
    setAnnouncement(`${coords.length} τετράγωνα — ${brushLabel.toLowerCase()}`);
  }, [activeFloorId, brush, brushLabel, onChange, plan]);

  // A drag can end outside the grid, so the stroke is closed at window level.
  // Registered once: the handlers read refs, so no re-subscription per move.
  useEffect(() => {
    window.addEventListener("pointerup", finishStroke);
    window.addEventListener("pointercancel", finishStroke);
    return () => {
      window.removeEventListener("pointerup", finishStroke);
      window.removeEventListener("pointercancel", finishStroke);
    };
  }, [finishStroke]);

  const beginStroke = (row: number, col: number) => {
    const point = { row, col };
    strokeRef.current = new Map([[cellKey(row, col), point]]);
    lastPointRef.current = point;
    setStrokeCells(new Map(strokeRef.current));
    setFocusTarget(point);
  };

  const extendStroke = (row: number, col: number) => {
    const from = lastPointRef.current;
    if (!from) return;
    const point = { row, col };
    strokeRef.current = addStrokePoint(strokeRef.current ?? new Map(), from, point);
    lastPointRef.current = point;
    setStrokeCells(new Map(strokeRef.current));
  };

  /** Pointer entry point for a whole stroke, also exposed for tests. */
  const handlePointerDown = (row: number, col: number, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    // Stops the drag from selecting text, and hands focus to the grid so the
    // keyboard continues from the square that was just clicked.
    event.preventDefault();
    gridRef.current?.focus({ preventScroll: true });
    beginStroke(row, col);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const move = ARROW_MOVES[event.key];
    if (move) {
      event.preventDefault();
      shouldFocusRef.current = true;
      setFocusTarget((current) => ({
        row: clampToAxis(current.row + move[0], activeFloor.rows),
        col: clampToAxis(current.col + move[1], activeFloor.cols),
      }));
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onChange(paintCells(plan, activeFloorId, [focusTarget], brushToCell(brush)));
      setAnnouncement(`Βάφτηκε: σειρά ${focusTarget.row + 1}, στήλη ${focusTarget.col + 1}`);
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onChange(paintCells(plan, activeFloorId, [focusTarget], { kind: "empty" }));
      setAnnouncement(`Καθαρίστηκε: σειρά ${focusTarget.row + 1}, στήλη ${focusTarget.col + 1}`);
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const hotkey = BRUSH_HOTKEYS.find((entry) => entry.key === event.key.toLowerCase());
    if (hotkey) {
      event.preventDefault();
      setBrush(hotkey.brush);
      setAnnouncement(hotkey.announce);
    }
  };

  const selectFloor = (nextFloorId: string) => {
    if (nextFloorId === activeFloorId) return;
    // Switching floors while dirty is not destructive — the plan is one object
    // and the other floor's edits stay in memory — but it can look like the
    // painted squares were lost, so confirm once rather than silently jumping.
    if (dirty && !window.confirm("Έχεις μη αποθηκευμένες αλλαγές. Αλλαγή ορόφου;")) return;
    finishStroke();
    setFloorId(nextFloorId);
    setFocusTarget({ row: 0, col: 0 });
  };

  // ---------------------------------------------------------------- mutations
  /** Runs a model operation, reports its error and pushes the new plan up. */
  const mutate = (operation: () => GymFloorPlan): string | null => {
    try {
      const next = operation();
      if (next !== plan) onChange(next);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Η ενέργεια απέτυχε.";
    }
  };

  const handleAddCategory = (draft: {
    name: string;
    color: string;
    shortLabel: string;
    pattern: CellPattern;
  }): string | null =>
    mutate(() =>
      addCategory(plan, {
        name: draft.name,
        color: draft.color,
        ...(draft.shortLabel.trim() === "" ? {} : { shortLabel: draft.shortLabel }),
        pattern: draft.pattern,
      })
    );

  const handleUpdateCategory = (
    categoryId: string,
    patch: Partial<{ name: string; color: string; shortLabel: string; pattern: CellPattern }>
  ): string | null =>
    mutate(() =>
      updateCategory(plan, categoryId, {
        name: patch.name,
        color: patch.color,
        ...(patch.shortLabel === undefined || patch.shortLabel.trim() === ""
          ? {}
          : { shortLabel: patch.shortLabel }),
        pattern: patch.pattern,
      })
    );

  const handleDeleteCategory = (categoryId: string, reassignTo: string | null) => {
    mutate(() => removeCategory(plan, categoryId, reassignTo));
  };

  const handleAddFloor = (input: { name: string; rows: number; cols: number }): string | null => {
    // Resolve the id up front so the editor can switch to the new floor; the
    // module would otherwise pick the same id internally and not return it.
    const newFloorId = nextId(
      "floor",
      plan.floors.map((floor) => floor.id)
    );
    const error = mutate(() => addFloor(plan, { ...input, id: newFloorId }));
    if (error === null) {
      finishStroke();
      setFloorId(newFloorId);
      setFocusTarget({ row: 0, col: 0 });
    }
    return error;
  };

  const handleRenameFloor = (targetFloorId: string, name: string): string | null =>
    mutate(() => renameFloor(plan, targetFloorId, name));

  const handleDeleteFloor = (targetFloorId: string) => {
    const error = mutate(() => removeFloor(plan, targetFloorId));
    if (error !== null) return;
    if (targetFloorId === activeFloorId) {
      const remaining = plan.floors.filter((floor) => floor.id !== targetFloorId);
      setFloorId(remaining[0]?.id ?? "floor-1");
      setFocusTarget({ row: 0, col: 0 });
    }
  };

  const handleResizeFloor = (targetFloorId: string, rows: number, cols: number) => {
    mutate(() => resizeFloor(plan, targetFloorId, rows, cols));
    setFocusTarget({ row: 0, col: 0 });
  };

  const usage = (categoryId: string) => countCategoryUsage(plan, categoryId);
  const countOutside = (rows: number, cols: number) => {
    const floor = findFloor(plan, activeFloorId);
    return floor ? countCellsOutsideBounds(floor, rows, cols) : 0;
  };

  return (
    <div className="space-y-4">
      <FloorPlanPrintStyles />

      {/* Header: title, dirty badge, clear + save */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="text-base font-bold text-primary flex items-center gap-2">
            <Square className="w-4 h-4 text-accent" />
            Κάτοψη Γυμναστηρίου
            {dirty && (
              <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/40 border border-amber-800/60 px-1.5 py-0.5 rounded-sm">
                Μη αποθηκευμένες αλλαγές
              </span>
            )}
          </h2>
          <p className="text-xs text-secondary">
            Ζωγράφισε τους χώρους ανά τετράγωνο. Κάθε χρώμα συνοδεύεται από σύντομη ετικέτα και
            μοτίβο, ώστε η κάτοψη να διαβάζεται και χωρίς χρώμα.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  "Διαγραφή ολόκληρης της κάτοψης από τον server; Η ενέργεια δεν αναιρείται."
                )
              ) {
                return;
              }
              onClear();
            }}
            disabled={clearing}
            className="px-3 py-2 rounded-sm bg-surface hover:bg-surface-elevated text-secondary hover:text-red-300 text-xs font-semibold border border-border flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {clearing ? "Διαγραφή..." : "Διαγραφή κάτοψης"}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!validation.valid || saving}
            title={validation.valid ? undefined : "Διόρθωσε τα σφάλματα πρώτα"}
            className="px-3.5 py-2 rounded-sm bg-accent hover:bg-accent-hover text-accent-ink text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Αποθήκευση..." : "Αποθήκευση κάτοψης"}
          </button>
        </div>
      </div>

      <FloorPlanTabs
        floors={plan.floors}
        activeFloorId={activeFloorId}
        onSelect={selectFloor}
        label="Όροφοι προς επεξεργασία"
      />

      <div className="grid grid-cols-1 xl:grid-cols-[250px_minmax(0,1fr)_290px] gap-4 items-start">
        {/* Left: brushes + floors */}
        <div className="space-y-4 order-2 xl:order-1">
          <section className="p-3 rounded-xl bg-surface border border-border space-y-3">
            <h3 className="text-xs font-bold text-primary flex items-center gap-1.5">
              <PaintBucket className="w-3.5 h-3.5 text-accent" />
              Πινέλα
            </h3>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setBrush(ERASER_BRUSH)}
                aria-pressed={eraserActive}
                className={`px-2 py-1.5 rounded-sm text-[11px] font-semibold border flex items-center justify-center gap-1 ${
                  eraserActive
                    ? "border-accent bg-accent/10 text-primary"
                    : "border-border text-secondary hover:text-primary"
                }`}
              >
                <Eraser className="w-3 h-3" />
                Γόμα
              </button>
              <button
                type="button"
                onClick={() => setBrush(VOID_BRUSH)}
                aria-pressed={voidActive}
                className={`px-2 py-1.5 rounded-sm text-[11px] font-semibold border flex items-center justify-center gap-1 ${
                  voidActive
                    ? "border-accent bg-accent/10 text-primary"
                    : "border-border text-secondary hover:text-primary"
                }`}
              >
                <Square className="w-3 h-3" />× Τοίχος
              </button>
            </div>

            <div className="flex flex-wrap gap-1">
              {plan.categories.map((category) => {
                const active = brushesEqual(brush, categoryBrush(category.id));
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setBrush(categoryBrush(category.id))}
                    aria-pressed={active}
                    title={category.name}
                    aria-label={`Πινέλο: ${category.name}`}
                    style={{ backgroundColor: category.color }}
                    className={`w-8 h-7 rounded-sm font-mono text-[10px] font-bold border ${
                      active ? "border-accent ring-1 ring-accent" : "border-border"
                    }`}
                  >
                    {category.shortLabel}
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-tertiary">
              Ενεργό: <span className="text-primary font-semibold">{brushLabel}</span>
            </p>

            <div className="text-[10px] text-tertiary border-t border-border pt-2 space-y-1">
              <p className="flex items-center gap-1 text-secondary font-semibold">
                <Keyboard className="w-3 h-3" />
                Πληκτρολόγιο
              </p>
              <p>← ↑ ↓ → μετακίνηση · Space/Enter βαφή · Delete καθαρισμός</p>
              <p>V τοίχος · E γόμα</p>
            </div>
          </section>

          <div className="p-3 rounded-xl bg-surface border border-border">
            <FloorPanel
              plan={plan}
              activeFloor={activeFloor}
              countOutside={countOutside}
              onSelect={selectFloor}
              onAdd={handleAddFloor}
              onRename={handleRenameFloor}
              onDelete={handleDeleteFloor}
              onResize={handleResizeFloor}
            />
          </div>
        </div>

        {/* Centre: the grid */}
        <div className="order-1 xl:order-2 space-y-2">
          <FloorPlanCanvas
            plan={plan}
            floorId={activeFloorId}
            theme={theme}
            labels={GREEK_FLOOR_PLAN_LABELS}
            legendMode="none"
            interactive
            focusRow={focusTarget.row}
            focusCol={focusTarget.col}
            strokePreview={strokePreview}
            gridRef={gridRef}
            gridProps={{
              role: "group",
              // Programmatically focusable so a click can hand keyboard control
              // to the grid: `onKeyDown` is attached here, and a click on a
              // square would otherwise leave `document.activeElement` on BODY.
              // -1 keeps the grid itself out of the tab order; the squares carry
              // the roving tabindex.
              tabIndex: -1,
              // Programmatically focusable so a click can hand keyboard control
              // to the grid: `onKeyDown` is attached here, and a click on a
              // square would otherwise leave `document.activeElement` on BODY.
              // -1 keeps the grid itself out of the tab order; the squares carry
              // the roving tabindex.
              "aria-label": `Πίνακας κάτοψης: ${activeFloor.name}, ${activeFloor.rows} σειρές επί ${activeFloor.cols} στήλες`,
              onKeyDown: handleKeyDown,
              onPointerDown: (event) => {
                const point = coordFromTarget(event.target);
                if (point) handlePointerDown(point.row, point.col, event);
              },
              onPointerOver: (event) => {
                // `pointerover` bubbles (unlike `pointerenter`), so one listener
                // on the grid covers every square.
                if (!lastPointRef.current) return;
                const point = coordFromTarget(event.target);
                if (point) extendStroke(point.row, point.col);
              },
              onDragStart: (event) => event.preventDefault(),
            }}
          />
          <p className="text-[10px] text-tertiary text-center">
            Σύρε για συνεχόμενη γραμμή. Μία κίνηση = μία αλλαγή στο μοντέλο.
          </p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </div>

        {/* Right: legend + categories + validation */}
        <div className="order-3 space-y-4">
          <section className="p-3 rounded-xl bg-surface border border-border space-y-2">
            <h3 className="text-xs font-bold text-primary">Υπόμνημα ορόφου</h3>
            <FloorPlanLegend entries={legend} />
          </section>

          <div className="p-3 rounded-xl bg-surface border border-border">
            <CategoryPanel
              plan={plan}
              usage={usage}
              onAdd={handleAddCategory}
              onUpdate={handleUpdateCategory}
              onDelete={handleDeleteCategory}
              activeCategoryId={brush.kind === "machine" ? brush.categoryId : null}
              onSelectCategory={(categoryId) => setBrush(categoryBrush(categoryId))}
            />
          </div>

          <section className="p-3 rounded-xl bg-surface border border-border space-y-2">
            <h3 className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-accent" />
              Έλεγχος
            </h3>
            {issues.length === 0 && validation.warnings.length === 0 && (
              <p className="text-[11px] text-emerald-400">Η κάτοψη είναι έγκυρη.</p>
            )}
            {issues.length > 0 && (
              <ul className="space-y-1">
                {issues.map((issue, index) => (
                  <li
                    key={`${issue.code}-${issue.path ?? "root"}-${index}`}
                    className="text-[11px] text-red-300"
                  >
                    {issue.message}
                    {issue.path && (
                      <span className="text-tertiary font-mono text-[10px]"> ({issue.path})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {validation.warnings.length > 0 && (
              <ul className="space-y-1">
                {validation.warnings.map((issue, index) => (
                  <li
                    key={`${issue.code}-${issue.path ?? "root"}-${index}`}
                    className="text-[11px] text-amber-300"
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {issues.length > 0 && (
              <p className="text-[10px] text-tertiary">
                Τα σφάλματα μπλοκάρουν την αποθήκευση. Οι προειδοποιήσεις όχι.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
