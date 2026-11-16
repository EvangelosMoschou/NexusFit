"use client";

/**
 * React binding for the CSS-variable theme adapter.
 *
 * `useSyncExternalStore` is the right tool here: the palette lives outside
 * React (a `data-theme` attribute on `<html>` plus the CSS variables it
 * switches), and the server snapshot must be deterministic. Using it instead of
 * `useEffect` + `setState` avoids both a hydration mismatch and the
 * "setState synchronously within an effect" lint rule the repo already tracks.
 */

import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_FLOOR_PLAN_THEME, type FloorPlanTheme } from "@/modules/gym-floor-plan";
import {
  cssColorToHex,
  FLOOR_PLAN_THEME_VARIABLES,
  readFloorPlanThemeSignature,
} from "@/components/floor-plan/theme";

/** Server and first-client-render snapshot: no palette can be read there. */
const SERVER_SIGNATURE = "";

function subscribeToThemeChanges(onStoreChange: () => void): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }
  // The preview switcher only changes the attribute, but a host may also swap
  // variables through a class or an inline style, so all three are watched.
  const observer = new MutationObserver(() => onStoreChange());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class", "style"],
  });
  return () => observer.disconnect();
}

/**
 * Turns a palette signature into a `FloorPlanTheme`, falling back field by
 * field for missing or unparseable values (e.g. an unstyled test document).
 */
export function themeFromSignature(
  signature: string,
  fallback: FloorPlanTheme = DEFAULT_FLOOR_PLAN_THEME
): FloorPlanTheme {
  if (signature.length === 0) return fallback;
  const values = signature.split("|");
  if (values.length !== FLOOR_PLAN_THEME_VARIABLES.length) return fallback;

  const theme: FloorPlanTheme = { ...fallback };
  FLOOR_PLAN_THEME_VARIABLES.forEach(([field], index) => {
    const resolved = cssColorToHex(values[index]);
    if (resolved !== null) theme[field] = resolved;
  });
  return theme;
}

/**
 * The hex theme for the current page palette.
 *
 * The initial server render (and any test that does not set the variables)
 * uses `DEFAULT_FLOOR_PLAN_THEME`; after hydration the six CSS variables are
 * read and the plan is re-themed on the next theme switch.
 */
export function useFloorPlanTheme(
  fallback: FloorPlanTheme = DEFAULT_FLOOR_PLAN_THEME
): FloorPlanTheme {
  const signature = useSyncExternalStore(
    subscribeToThemeChanges,
    readFloorPlanThemeSignature,
    () => SERVER_SIGNATURE
  );
  return useMemo(() => themeFromSignature(signature, fallback), [fallback, signature]);
}
