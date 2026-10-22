"use client";

import { useEffect, useRef } from "react";

// Overlays currently mounted, in the order they opened. Kept module-level so
// every instance shares one stack.
const openOverlays: symbol[] = [];

// Closes an overlay when the user presses Escape.
//
// Only the top-most overlay reacts, so when modals are stacked Escape dismisses
// the one on screen instead of closing all of them at once. The callback is held
// in a ref so an inline handler identity change does not reorder the stack.
export function useEscapeKey(active: boolean, onClose: () => void): void {
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) {
    idRef.current = Symbol("overlay");
  }

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    const id = idRef.current!;
    openOverlays.push(id);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openOverlays[openOverlays.length - 1] !== id) return;
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const index = openOverlays.indexOf(id);
      if (index !== -1) openOverlays.splice(index, 1);
    };
  }, [active]);
}
