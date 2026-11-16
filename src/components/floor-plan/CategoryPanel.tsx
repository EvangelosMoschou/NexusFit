"use client";

/**
 * Category CRUD for the floor plan editor.
 *
 * A category is a stable id with a name, a `#RRGGBB` colour, a 1–3 character
 * short label and a pattern. Editing any of those never touches a single cell
 * (cells reference the id), which is why the form can be a plain inline editor.
 *
 * Deleting is the one operation that needs a decision, and the module makes that
 * explicit: `removeCategory(plan, id, reassignTo)` takes `null` (clear the
 * squares) or another category id (move them, keeping machine labels). The dialog
 * here shows `countCategoryUsage` first and requires the choice.
 */

import React, { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  FLOOR_PLAN_LIMITS,
  getInkColor,
  type Category,
  type CellPattern,
  type GymFloorPlan,
} from "@/modules/gym-floor-plan";
import {
  FLOOR_PLAN_CATEGORY_PALETTE,
  FLOOR_PLAN_PATTERN_OPTIONS,
  formatSquareCount,
  squareNoun,
} from "@/components/floor-plan/labels";
import { LegendSwatch } from "@/components/floor-plan/FloorPlanLegend";
import {
  FloorPlanColorField,
  FloorPlanField,
  FloorPlanTextField,
  FLOOR_PLAN_INPUT_CLASS,
} from "@/components/floor-plan/fields";
import { ConfirmDialog } from "@/components/floor-plan/ConfirmDialog";

/** Default colour for the next category: the first palette entry not in use. */
function nextPaletteColor(plan: GymFloorPlan): string {
  const used = new Set(plan.categories.map((category) => category.color.toUpperCase()));
  const free = FLOOR_PLAN_CATEGORY_PALETTE.find((swatch) => !used.has(swatch.color.toUpperCase()));
  return free?.color ?? FLOOR_PLAN_CATEGORY_PALETTE[0].color;
}

interface CategoryDraft {
  name: string;
  color: string;
  shortLabel: string;
  pattern: CellPattern;
}

interface CategoryPanelProps {
  plan: GymFloorPlan;
  usage: (categoryId: string) => number;
  onAdd: (draft: CategoryDraft) => string | null;
  onUpdate: (categoryId: string, patch: Partial<CategoryDraft>) => string | null;
  onDelete: (categoryId: string, reassignTo: string | null) => void;
  /** Category-driven brush selection, so the legend doubles as the tool picker. */
  activeCategoryId?: string | null;
  onSelectCategory?: (categoryId: string) => void;
}

const EMPTY_DRAFT: CategoryDraft = {
  name: "",
  color: FLOOR_PLAN_CATEGORY_PALETTE[0].color,
  shortLabel: "",
  pattern: "solid",
};

export const CategoryPanel: React.FC<CategoryPanelProps> = ({
  plan,
  usage,
  onAdd,
  onUpdate,
  onDelete,
  activeCategoryId = null,
  onSelectCategory,
}) => {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string>("");

  const atLimit = plan.categories.length >= FLOOR_PLAN_LIMITS.maxCategories;

  const startAdding = () => {
    setAdding(true);
    setEditingId(null);
    setFormError(null);
    setDraft({
      ...EMPTY_DRAFT,
      color: nextPaletteColor(plan),
    });
  };

  const startEditing = (category: Category) => {
    setEditingId(category.id);
    setAdding(false);
    setFormError(null);
    setDraft({
      name: category.name,
      color: category.color,
      shortLabel: category.shortLabel,
      pattern: category.pattern,
    });
  };

  const submitAdd = () => {
    const error = onAdd(draft);
    if (error) {
      setFormError(error);
      return;
    }
    setAdding(false);
    setFormError(null);
    setDraft(EMPTY_DRAFT);
  };

  const submitUpdate = (categoryId: string) => {
    const error = onUpdate(categoryId, draft);
    if (error) {
      setFormError(error);
      return;
    }
    setEditingId(null);
    setFormError(null);
  };

  const askDelete = (category: Category) => {
    setPendingDelete(category);
    // Defaults to "clear", per the design doc: it is the choice that destroys
    // the least (the category was already being deleted) and the destructive
    // alternative stays one explicit click away.
    setDeleteTarget("");
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const reassignTo = deleteTarget === "" ? null : deleteTarget;
    onDelete(pendingDelete.id, reassignTo);
    setPendingDelete(null);
    setDeleteTarget("");
  };

  const pendingUsage = pendingDelete ? usage(pendingDelete.id) : 0;

  /** Shared add/edit form body. */
  const formBody = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FloorPlanTextField
        id="fp-category-name"
        label="Όνομα κατηγορίας"
        value={draft.name}
        maxLength={FLOOR_PLAN_LIMITS.maxCategoryNameLength}
        placeholder="π.χ. Μηχανήματα Impulse"
        onChange={(name) => setDraft((prev) => ({ ...prev, name }))}
      />
      <FloorPlanTextField
        id="fp-category-short-label"
        label="Σύντομη ετικέτα"
        value={draft.shortLabel}
        maxLength={FLOOR_PLAN_LIMITS.maxShortLabelLength}
        placeholder="IM"
        hint={`${FLOOR_PLAN_LIMITS.maxShortLabelLength} χαρακτήρες, χωρίς κενά. Κενό = αυτόματο.`}
        mono
        onChange={(shortLabel) => setDraft((prev) => ({ ...prev, shortLabel }))}
      />
      <FloorPlanColorField
        id="fp-category-color"
        label="Χρώμα"
        value={draft.color}
        palette={FLOOR_PLAN_CATEGORY_PALETTE}
        onChange={(color) => setDraft((prev) => ({ ...prev, color }))}
      />
      <FloorPlanField label="Μοτίβο" htmlFor="fp-category-pattern">
        <select
          id="fp-category-pattern"
          value={draft.pattern}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, pattern: event.target.value as CellPattern }))
          }
          className={FLOOR_PLAN_INPUT_CLASS}
        >
          {FLOOR_PLAN_PATTERN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FloorPlanField>
    </div>
  );

  const formActions = (onSubmit: () => void, submitLabel: string, onCancel: () => void) => (
    <div className="flex items-center justify-between gap-2 pt-1">
      <div className="flex items-center gap-2">
        <LegendSwatch
          entry={{
            color: draft.color,
            inkColor: getInkColor(draft.color),
            shortLabel: draft.shortLabel.slice(0, 3).toUpperCase() || "?",
            pattern: draft.pattern,
          }}
        />
        <span className="text-[10px] text-tertiary">Προεπισκόπηση χρώματος & μοτίβου</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-sm bg-surface-elevated hover:bg-border text-primary text-[11px] font-semibold border border-border"
        >
          Ακύρωση
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="px-2.5 py-1.5 rounded-sm bg-btn hover:bg-btn-hover text-btn-ink text-[11px] font-bold"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );

  return (
    <section className="space-y-3" aria-labelledby="fp-categories-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="fp-categories-heading" className="text-xs font-bold text-primary">
          Κατηγορίες ({plan.categories.length}/{FLOOR_PLAN_LIMITS.maxCategories})
        </h3>
        <button
          type="button"
          onClick={startAdding}
          disabled={atLimit || adding}
          className="px-2.5 py-1.5 rounded-sm bg-accent hover:bg-accent-hover text-accent-ink text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          Νέα κατηγορία
        </button>
      </div>

      {atLimit && (
        <p className="text-[10px] text-amber-300">
          Συμπληρώθηκε το όριο των {FLOOR_PLAN_LIMITS.maxCategories} κατηγοριών.
        </p>
      )}

      {plan.categories.length === 0 && !adding && (
        <div className="p-4 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-secondary">
          Δεν υπάρχει καμία κατηγορία. Πρόσθεσε την πρώτη για να αρχίσεις να ζωγραφίζεις.
        </div>
      )}

      <ul className="space-y-1.5">
        {plan.categories.map((category) => {
          const isEditing = editingId === category.id;
          const count = usage(category.id);
          return (
            <li
              key={category.id}
              className="rounded-xl bg-surface border border-border overflow-hidden"
            >
              <div className="flex items-center gap-2 p-2.5">
                <button
                  type="button"
                  onClick={() => onSelectCategory?.(category.id)}
                  aria-pressed={activeCategoryId === category.id}
                  title="Χρήση ως πινέλο"
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <LegendSwatch entry={{ ...category, inkColor: getInkColor(category.color) }} />
                  <span className="font-mono font-bold text-[10px] text-tertiary w-6 shrink-0">
                    {category.shortLabel}
                  </span>
                  <span className="text-xs text-primary truncate flex-1">{category.name}</span>
                  <span className="text-[10px] text-tertiary font-mono shrink-0">
                    {formatSquareCount(count)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => (isEditing ? setEditingId(null) : startEditing(category))}
                  aria-label={`Επεξεργασία κατηγορίας ${category.name}`}
                  title="Επεξεργασία"
                  className="p-1.5 rounded-sm text-secondary hover:text-primary transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => askDelete(category)}
                  aria-label={`Διαγραφή κατηγορίας ${category.name}`}
                  title="Διαγραφή"
                  className="p-1.5 rounded-sm text-secondary hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {isEditing && (
                <div className="p-3 border-t border-border space-y-3">
                  {formBody}
                  {formError && <p className="text-[11px] text-red-300">{formError}</p>}
                  {formActions(
                    () => submitUpdate(category.id),
                    "Αποθήκευση",
                    () => setEditingId(null)
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding && (
        <div className="p-3 rounded-xl bg-surface border border-border space-y-3">
          <h4 className="text-[11px] font-bold text-primary">Νέα κατηγορία</h4>
          {formBody}
          {formError && <p className="text-[11px] text-red-300">{formError}</p>}
          {formActions(submitAdd, "Προσθήκη", () => setAdding(false))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Διαγραφή κατηγορίας «${pendingDelete?.name ?? ""}»`}
        confirmLabel={`${
          deleteTarget === "" ? "Καθαρισμός" : "Μετακίνηση"
        } ${formatSquareCount(pendingUsage, "genitive")}`}
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      >
        <p>
          Η κατηγορία χρησιμοποιείται σε <strong>{pendingUsage}</strong> {squareNoun(pendingUsage)}.
          Διάλεξε τι θα γίνει με αυτά:
        </p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Τι θα γίνουν τα τετράγωνα της κατηγορίας</legend>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="fp-delete-mode"
              checked={deleteTarget === ""}
              onChange={() => setDeleteTarget("")}
              className="mt-0.5"
            />
            <span>
              <span className="text-primary font-semibold">Καθαρισμός</span> — τα τετράγωνα γίνονται
              ελεύθερος χώρος.
            </span>
          </label>
          {plan.categories.filter((other) => other.id !== pendingDelete?.id).length > 0 && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="fp-delete-mode"
                checked={deleteTarget !== ""}
                onChange={() =>
                  setDeleteTarget(
                    plan.categories.find((other) => other.id !== pendingDelete?.id)?.id ?? ""
                  )
                }
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="text-primary font-semibold">Μετακίνηση σε</span>{" "}
                <select
                  value={deleteTarget}
                  onChange={(event) => setDeleteTarget(event.target.value)}
                  disabled={deleteTarget === ""}
                  aria-label="Κατηγορία προορισμού"
                  className="ml-1 px-2 py-1 rounded-sm bg-background border border-border text-primary text-[11px] disabled:opacity-50"
                >
                  {plan.categories
                    .filter((other) => other.id !== pendingDelete?.id)
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.name}
                      </option>
                    ))}
                </select>
                <span className="block text-[10px] text-tertiary mt-0.5">
                  Οι ετικέτες μηχανημάτων διατηρούνται.
                </span>
              </span>
            </label>
          )}
        </fieldset>
      </ConfirmDialog>
    </section>
  );
};
