"use client";

/**
 * Floor management for the floor plan editor: add, rename, delete, resize.
 *
 * Resize is the subtle one. `resizeFloor` is top-left anchored: cells inside the
 * new bounds keep their exact `(row, col)`, cells outside are discarded, new
 * squares are empty. Growing therefore never needs a confirmation, but shrinking
 * can delete work, so the module exposes `countCellsOutsideBounds` and the editor
 * must ask before applying it (design doc §5.5).
 */

import React, { useState } from "react";
import { Building2, Check, Plus, Trash2, X } from "lucide-react";
import { FLOOR_PLAN_LIMITS, type Floor, type GymFloorPlan } from "@/modules/gym-floor-plan";
import { FloorPlanTextField, FLOOR_PLAN_INPUT_CLASS } from "@/components/floor-plan/fields";
import { ConfirmDialog } from "@/components/floor-plan/ConfirmDialog";
import { axisLabel, dimensionError, parseDimension } from "@/components/floor-plan/dimensions";

interface FloorPanelProps {
  plan: GymFloorPlan;
  activeFloor: Floor;
  /** Non-empty cells a resize would discard (module `countCellsOutsideBounds`). */
  countOutside: (rows: number, cols: number) => number;
  onSelect: (floorId: string) => void;
  onAdd: (input: { name: string; rows: number; cols: number }) => string | null;
  onRename: (floorId: string, name: string) => string | null;
  onDelete: (floorId: string) => void;
  onResize: (floorId: string, rows: number, cols: number) => void;
}

/**
 * The two labels this panel repeats.
 *
 * `Όνομα ορόφου` names both the add form's name field and the rename field, and
 * `Διαγραφή ορόφου` is used as the delete button's title, its `aria-label`
 * prefix and the dialog's confirm label. Naming them once keeps the visible
 * label and the accessible name from diverging, which is the failure mode a
 * jsdom test asserting on `getByLabelText` would silently accept.
 */
const FLOOR_NAME_LABEL = "Όνομα ορόφου";
const FLOOR_DELETE_LABEL = "Διαγραφή ορόφου";

/**
 * Re-keys on the active floor so every draft (name, dimensions, add-form,
 * dialogs) starts from that floor's real values.
 *
 * This is the React "reset state with a key" pattern instead of an effect that
 * copies props into state: switching floors remounts the form, so the inputs can
 * never show a previous floor's dimensions, with no extra render pass and no
 * risk of a stale draft being submitted.
 */
export const FloorPanel: React.FC<FloorPanelProps> = (props) => (
  <FloorPanelBody key={props.activeFloor.id} {...props} />
);

const FloorPanelBody: React.FC<FloorPanelProps> = ({
  plan,
  activeFloor,
  countOutside,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onResize,
}) => {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(activeFloor.name);
  const [nameError, setNameError] = useState<string | null>(null);

  const [rowsDraft, setRowsDraft] = useState(String(activeFloor.rows));
  const [colsDraft, setColsDraft] = useState(String(activeFloor.cols));
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [pendingResize, setPendingResize] = useState<{ rows: number; cols: number } | null>(null);

  const [adding, setAdding] = useState(false);
  const [newFloor, setNewFloor] = useState({
    name: "",
    rows: String(activeFloor.rows),
    cols: String(activeFloor.cols),
  });
  const [addError, setAddError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Floor | null>(null);

  const atFloorLimit = plan.floors.length >= FLOOR_PLAN_LIMITS.maxFloors;
  const isLastFloor = plan.floors.length <= 1;

  const submitRename = () => {
    const error = onRename(activeFloor.id, nameDraft);
    if (error) {
      setNameError(error);
      return;
    }
    setRenaming(false);
    setNameError(null);
  };

  const applyResize = (rows: number, cols: number) => {
    onResize(activeFloor.id, rows, cols);
    setPendingResize(null);
  };

  const submitResize = () => {
    const rows = parseDimension(rowsDraft);
    const cols = parseDimension(colsDraft);
    const error = dimensionError(rows, "rows") ?? dimensionError(cols, "cols");
    if (error) {
      setSizeError(error);
      return;
    }
    setSizeError(null);

    if (rows === activeFloor.rows && cols === activeFloor.cols) {
      setSizeError("Το μέγεθος είναι ήδη αυτό.");
      return;
    }

    // Growing (or squeezing in one axis while the other grows) can still discard
    // cells on the shrunk axis, so the check is always `countCellsOutsideBounds`.
    const discarded = countOutside(rows, cols);
    if (discarded > 0) {
      setPendingResize({ rows, cols });
      return;
    }
    applyResize(rows, cols);
  };

  const submitAdd = () => {
    const rows = parseDimension(newFloor.rows);
    const cols = parseDimension(newFloor.cols);
    const error = dimensionError(rows, "rows") ?? dimensionError(cols, "cols");
    if (error) {
      setAddError(error);
      return;
    }
    const failure = onAdd({ name: newFloor.name, rows, cols });
    if (failure) {
      setAddError(failure);
      return;
    }
    setAdding(false);
    setAddError(null);
    setNewFloor({ name: "", rows: String(activeFloor.rows), cols: String(activeFloor.cols) });
  };

  const discardedForPending = pendingResize
    ? countOutside(pendingResize.rows, pendingResize.cols)
    : 0;

  return (
    <section className="space-y-3" aria-labelledby="fp-floors-heading">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="fp-floors-heading"
          className="text-xs font-bold text-primary flex items-center gap-1.5"
        >
          <Building2 className="w-3.5 h-3.5 text-accent" />
          Όροφοι ({plan.floors.length}/{FLOOR_PLAN_LIMITS.maxFloors})
        </h3>
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setAddError(null);
            setNewFloor({
              name: "",
              rows: String(activeFloor.rows),
              cols: String(activeFloor.cols),
            });
          }}
          disabled={atFloorLimit || adding}
          className="px-2.5 py-1.5 rounded-sm bg-surface-elevated hover:bg-border text-primary text-[11px] font-semibold border border-border flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          Νέος όροφος
        </button>
      </div>

      <ul className="space-y-1">
        {plan.floors.map((floor) => (
          <li key={floor.id}>
            <button
              type="button"
              onClick={() => onSelect(floor.id)}
              aria-current={floor.id === activeFloor.id ? "true" : undefined}
              className={`w-full text-left px-2.5 py-2 rounded-sm text-xs transition-colors ${
                floor.id === activeFloor.id
                  ? "bg-btn text-btn-ink font-bold"
                  : "bg-surface text-secondary hover:text-primary border border-border"
              }`}
            >
              <span className="truncate">{floor.name}</span>
              <span className="ml-2 font-mono text-[10px] opacity-70">
                {floor.rows}×{floor.cols}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="p-3 rounded-xl bg-surface border border-border space-y-3">
          <h4 className="text-[11px] font-bold text-primary">Νέος όροφος</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FloorPlanTextField
              id="fp-new-floor-name"
              label={FLOOR_NAME_LABEL}
              value={newFloor.name}
              maxLength={FLOOR_PLAN_LIMITS.maxFloorNameLength}
              placeholder="π.χ. Όροφος 1"
              onChange={(name) => setNewFloor((prev) => ({ ...prev, name }))}
            />
            <FloorPlanTextField
              id="fp-new-floor-rows"
              label={axisLabel("rows")}
              type="number"
              min={FLOOR_PLAN_LIMITS.minRows}
              max={FLOOR_PLAN_LIMITS.maxRows}
              value={newFloor.rows}
              onChange={(rows) => setNewFloor((prev) => ({ ...prev, rows }))}
            />
            <FloorPlanTextField
              id="fp-new-floor-cols"
              label={axisLabel("cols")}
              type="number"
              min={FLOOR_PLAN_LIMITS.minCols}
              max={FLOOR_PLAN_LIMITS.maxCols}
              value={newFloor.cols}
              onChange={(cols) => setNewFloor((prev) => ({ ...prev, cols }))}
            />
          </div>
          {addError && <p className="text-[11px] text-red-300">{addError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-2.5 py-1.5 rounded-sm bg-surface-elevated hover:bg-border text-primary text-[11px] font-semibold border border-border"
            >
              Ακύρωση
            </button>
            <button
              type="button"
              onClick={submitAdd}
              className="px-2.5 py-1.5 rounded-sm bg-btn hover:bg-btn-hover text-btn-ink text-[11px] font-bold"
            >
              Προσθήκη ορόφου
            </button>
          </div>
        </div>
      )}

      {/* Active floor settings */}
      <div className="p-3 rounded-xl bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold text-primary">Ενεργός όροφος</h4>
          <button
            type="button"
            onClick={() => setPendingDelete(activeFloor)}
            disabled={isLastFloor}
            title={isLastFloor ? "Ο τελευταίος όροφος δεν διαγράφεται" : FLOOR_DELETE_LABEL}
            className="p-1.5 rounded-sm text-secondary hover:text-red-400 transition-colors disabled:opacity-40"
            aria-label={`${FLOOR_DELETE_LABEL} ${activeFloor.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {renaming ? (
          <div className="space-y-2">
            <FloorPlanTextField
              id="fp-floor-rename"
              label={FLOOR_NAME_LABEL}
              value={nameDraft}
              maxLength={FLOOR_PLAN_LIMITS.maxFloorNameLength}
              onChange={setNameDraft}
            />
            {nameError && <p className="text-[11px] text-red-300">{nameError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitRename}
                className="px-2 py-1 rounded-sm bg-btn hover:bg-btn-hover text-btn-ink text-[11px] font-bold flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Αποθήκευση
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenaming(false);
                  setNameDraft(activeFloor.name);
                  setNameError(null);
                }}
                className="px-2 py-1 rounded-sm bg-surface-elevated hover:bg-border text-primary text-[11px] font-semibold border border-border flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Ακύρωση
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-primary font-semibold truncate">{activeFloor.name}</span>
            <button
              type="button"
              onClick={() => {
                setRenaming(true);
                setNameDraft(activeFloor.name);
              }}
              className="text-[11px] text-accent hover:underline shrink-0"
            >
              Μετονομασία
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fp-floor-rows" className="block text-[10px] text-tertiary mb-1">
              {axisLabel("rows")}
            </label>
            <input
              id="fp-floor-rows"
              type="number"
              min={FLOOR_PLAN_LIMITS.minRows}
              max={FLOOR_PLAN_LIMITS.maxRows}
              value={rowsDraft}
              onChange={(event) => setRowsDraft(event.target.value)}
              className={`${FLOOR_PLAN_INPUT_CLASS} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="fp-floor-cols" className="block text-[10px] text-tertiary mb-1">
              {axisLabel("cols")}
            </label>
            <input
              id="fp-floor-cols"
              type="number"
              min={FLOOR_PLAN_LIMITS.minCols}
              max={FLOOR_PLAN_LIMITS.maxCols}
              value={colsDraft}
              onChange={(event) => setColsDraft(event.target.value)}
              className={`${FLOOR_PLAN_INPUT_CLASS} font-mono`}
            />
          </div>
        </div>
        <p className="text-[10px] text-tertiary">
          Όριο {FLOOR_PLAN_LIMITS.minRows}–{FLOOR_PLAN_LIMITS.maxRows} ανά άξονα. Η αλλαγή μεγέθους
          αγκυρώνεται πάνω-αριστερά.
        </p>
        {sizeError && <p className="text-[11px] text-red-300">{sizeError}</p>}
        <button
          type="button"
          onClick={submitResize}
          className="w-full px-2.5 py-1.5 rounded-sm bg-surface-elevated hover:bg-border text-primary text-[11px] font-semibold border border-border"
        >
          Εφαρμογή μεγέθους
        </button>
      </div>

      <ConfirmDialog
        open={pendingResize !== null}
        title="Σμίκρυνση ορόφου"
        confirmLabel="Σμίκρυνση"
        destructive
        onCancel={() => setPendingResize(null)}
        onConfirm={() => {
          if (pendingResize) applyResize(pendingResize.rows, pendingResize.cols);
        }}
      >
        <p>
          Θα διαγραφούν <strong>{discardedForPending}</strong> ζωγραφισμένα τετράγωνα
          {pendingResize ? ` (${pendingResize.rows} × ${pendingResize.cols})` : ""}. Η ενέργεια δεν
          αναιρείται.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`${FLOOR_DELETE_LABEL} «${pendingDelete?.name ?? ""}»`}
        confirmLabel={FLOOR_DELETE_LABEL}
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      >
        <p>
          Θα διαγραφεί ολόκληρος ο όροφος με{" "}
          <strong>
            {pendingDelete?.rows ?? 0} × {pendingDelete?.cols ?? 0}
          </strong>{" "}
          τετράγωνα. Η ενέργεια δεν αναιρείται.
        </p>
      </ConfirmDialog>
    </section>
  );
};
