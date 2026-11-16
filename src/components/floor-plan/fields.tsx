"use client";

/**
 * Shared form primitives for the floor-plan editor.
 *
 * The other admin tabs repeat the same `<label>`/`<input>` markup inline. This
 * feature has enough small fields (colours, short labels, dimensions) that
 * repeating it would bury the interesting logic, so the three controls that
 * recur are extracted here — and, being extracted, they get the accessible
 * label/control association the inline copies in other tabs are missing.
 */

import React from "react";

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const FloorPlanField: React.FC<FieldProps> = ({
  label,
  htmlFor,
  hint,
  children,
  className,
}) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="block text-[11px] text-secondary mb-1">
      {label}
    </label>
    {children}
    {hint && <p className="text-[10px] text-tertiary mt-1">{hint}</p>}
  </div>
);

export const FLOOR_PLAN_INPUT_CLASS =
  "w-full px-2.5 py-1.5 rounded-sm bg-background border border-border text-primary text-xs";

export const FLOOR_PLAN_LABEL_CLASS = "block text-[11px] text-secondary mb-1";

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  type?: "text" | "number";
  min?: number;
  max?: number;
  className?: string;
}

/** Single-line text/number input with a real (associated) label. */
export const FloorPlanTextField: React.FC<TextFieldProps> = ({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  hint,
  mono = false,
  type = "text",
  min,
  max,
  className,
}) => (
  <FloorPlanField label={label} htmlFor={id} hint={hint} className={className}>
    <input
      id={id}
      type={type}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={(event) => onChange(event.target.value)}
      className={`${FLOOR_PLAN_INPUT_CLASS} ${mono ? "font-mono" : ""}`}
    />
  </FloorPlanField>
);

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Curated swatches; a free colour picker is always available too. */
  palette: ReadonlyArray<{ color: string; name: string }>;
  className?: string;
}

/**
 * Colour control: native `<input type="color">` plus curated swatches.
 *
 * The native picker guarantees a valid `#RRGGBB` value, which is the module's
 * hard requirement (it computes WCAG contrast from it). The swatches are a
 * shortcut, not a restriction, and each carries a title so the choice is not
 * colour-only.
 */
export const FloorPlanColorField: React.FC<ColorFieldProps> = ({
  id,
  label,
  value,
  onChange,
  palette,
  className,
}) => (
  <FloorPlanField label={label} htmlFor={id} className={className}>
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        id={id}
        type="color"
        value={value.toLowerCase()}
        onChange={(event) => onChange(event.target.value)}
        className="w-8 h-8 rounded-sm bg-background border border-border cursor-pointer p-0.5"
      />
      <output htmlFor={id} className="font-mono text-[11px] text-secondary w-16">
        {value.toUpperCase()}
      </output>
      <div className="flex items-center gap-1">
        {palette.map((swatch) => (
          <button
            key={swatch.color}
            type="button"
            title={swatch.name}
            aria-label={swatch.name}
            aria-pressed={value.toUpperCase() === swatch.color.toUpperCase()}
            onClick={() => onChange(swatch.color)}
            style={{ backgroundColor: swatch.color }}
            className={`w-4 h-4 rounded-xs border ${
              value.toUpperCase() === swatch.color.toUpperCase()
                ? "border-accent ring-1 ring-accent"
                : "border-border"
            }`}
          />
        ))}
      </div>
    </div>
  </FloorPlanField>
);
