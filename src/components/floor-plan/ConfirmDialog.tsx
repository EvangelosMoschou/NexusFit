"use client";

/**
 * Confirmation dialog for a destructive floor-plan operation.
 *
 * `window.confirm` is used elsewhere in the admin (lead/member deletion), but the
 * two decisions here carry structure the strings alone cannot express:
 *
 *   - deleting a category must say how many squares it owns AND let the owner
 *     choose what happens to them (`removeCategory` has no silent default);
 *   - shrinking a floor must name exactly how many painted squares are lost.
 *
 * So this is a real `<dialog>`-style overlay with a labelled heading, a body
 * slot and a confirm/cancel pair. It is keyboard-dismissible through the shared
 * `useEscapeKey` stack, and focus moves to the confirm button on open.
 */

import React, { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { useEscapeKey } from "@/lib/useEscapeKey";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Renders the confirm button in the destructive style. */
  destructive?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Ακύρωση",
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEscapeKey(open, onCancel);

  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog so Escape/keyboard users are not stranded in
    // the page behind it.
    confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="floor-plan-confirm-title"
        className="w-full max-w-md rounded-xl bg-surface border border-border shadow-2xl p-5 space-y-3"
      >
        <h3
          id="floor-plan-confirm-title"
          className="text-sm font-bold text-primary flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          {title}
        </h3>

        {children && <div className="text-xs text-secondary space-y-3">{children}</div>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-sm bg-surface-elevated hover:bg-border text-primary text-xs font-semibold border border-border"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`px-3 py-1.5 rounded-sm text-xs font-bold disabled:opacity-50 ${
              destructive
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-btn hover:bg-btn-hover text-btn-ink"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
