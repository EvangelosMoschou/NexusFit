/**
 * Theme adapter between the app's CSS variables and the floor-plan module.
 *
 * The module needs resolved `#RRGGBB` colours because `getInkColor` computes
 * WCAG relative luminance from them (see `src/modules/gym-floor-plan/render.ts`).
 * The app keeps its palette as "R G B" triplets in CSS variables
 * (`--surface-rgb: 33 36 45`) so Tailwind can apply opacity modifiers, which
 * means the floor-plan component has to resolve them at runtime in the browser.
 *
 * Everything here is pure and testable: `resolveFloorPlanTheme` takes a reader
 * function, so a test (or an SSR pass) never needs `getComputedStyle`.
 */

import { DEFAULT_FLOOR_PLAN_THEME, type FloorPlanTheme } from "@/modules/gym-floor-plan";

/**
 * One CSS variable per theme field, in the order of the `FloorPlanTheme` type.
 *
 * `emptyColor` borrows `--bg-rgb` and `voidColor`/`mutedInkColor` borrow
 * `--muted-rgb`: the palette has no dedicated "walkable floor" or "structurally
 * unavailable" token, and these two read as the conventional pair (darker plane
 * for walkable space, greyed-out block for void). A host that does have such
 * tokens can override the map in `resolveFloorPlanTheme`.
 */
export const FLOOR_PLAN_THEME_VARIABLES: ReadonlyArray<readonly [keyof FloorPlanTheme, string]> = [
  ["surfaceColor", "--surface-rgb"],
  ["emptyColor", "--bg-rgb"],
  ["gridLineColor", "--border-rgb"],
  ["voidColor", "--muted-rgb"],
  ["inkColor", "--ink-rgb"],
  ["mutedInkColor", "--muted-rgb"],
];

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) => clampByte(value).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/**
 * Converts one palette value to `#RRGGBB`.
 *
 * Accepted shapes, because different themes (and different browsers) hand back
 * different strings:
 *   - `"33 36 45"`   — the app's variable format;
 *   - `"33, 36, 45"` — as authored in some stylesheets;
 *   - `"#21242d"` / `"#234"` — a theme that already stores hex.
 *
 * Returns `null` for anything else, so the caller can fall back to the module
 * default instead of guessing a colour.
 */
export function cssColorToHex(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hexMatch) {
    const digits = hexMatch[1];
    if (digits.length === 3) {
      const expanded = digits
        .split("")
        .map((digit) => `${digit}${digit}`)
        .join("");
      return `#${expanded}`.toUpperCase();
    }
    return `#${digits}`.toUpperCase();
  }

  const channels = trimmed.split(/[\s,]+/).filter(Boolean);
  if (channels.length !== 3) return null;
  const parsed = channels.map((channel) => Number.parseFloat(channel));
  if (parsed.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
    return null;
  }
  return toHex({ r: parsed[0], g: parsed[1], b: parsed[2] });
}

/**
 * Builds a `FloorPlanTheme` from a CSS-variable reader.
 *
 * Any variable that is missing, empty or unparseable falls back to the matching
 * `DEFAULT_FLOOR_PLAN_THEME` value, so a half-themed host page still renders a
 * readable plan instead of throwing.
 */
export function resolveFloorPlanTheme(
  readVariable: (name: string) => string,
  fallback: FloorPlanTheme = DEFAULT_FLOOR_PLAN_THEME
): FloorPlanTheme {
  const theme: FloorPlanTheme = { ...fallback };
  for (const [field, variable] of FLOOR_PLAN_THEME_VARIABLES) {
    const resolved = cssColorToHex(readVariable(variable));
    if (resolved !== null) theme[field] = resolved;
  }
  return theme;
}

/**
 * Reads the six palette values off an element as one comparable string.
 *
 * This lives here — not in the hook — because this file is the adapter between
 * the app's CSS variables and the module's hex theme, and the read is the part
 * that touches `getComputedStyle`. Returning a joined *string* rather than a
 * theme object matters to the caller: `useSyncExternalStore` compares snapshots
 * with `Object.is`, so a fresh object every render would loop forever.
 *
 * Returns `""` on the server, which is also the server snapshot: the caller then
 * renders `DEFAULT_FLOOR_PLAN_THEME` so hydration has nothing to disagree about.
 */
export function readFloorPlanThemeSignature(element?: HTMLElement | null): string {
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  const target = element ?? document.documentElement;
  if (!target || typeof window.getComputedStyle !== "function") return "";
  const styles = window.getComputedStyle(target);
  return FLOOR_PLAN_THEME_VARIABLES.map(([, variable]) =>
    styles.getPropertyValue(variable).trim()
  ).join("|");
}
