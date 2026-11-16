/**
 * Floor switcher used by both views.
 *
 * Floors are displayed in array order, which the module documents as the display
 * order, so the tabs need no sorting or index mapping. Rendered as a real tablist
 * so arrow keys move between floors; the public view and the editor share it so
 * the two never drift.
 */

import React from "react";

interface FloorPlanTabsProps {
  floors: ReadonlyArray<{ id: string; name: string }>;
  activeFloorId: string;
  onSelect: (floorId: string) => void;
  /** `tablist` label; different wording for the public and admin contexts. */
  label?: string;
}

export const FloorPlanTabs: React.FC<FloorPlanTabsProps> = ({
  floors,
  activeFloorId,
  onSelect,
  label = "Όροφοι κάτοψης",
}) => {
  // Arrow keys are handled on each tab, not on the tablist container: a
  // `tablist` with an interactive handler must itself be focusable, and the tabs
  // already are (roving tabindex), so the listener belongs on them.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = floors.findIndex((floor) => floor.id === activeFloorId);
    if (index === -1) return;
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + offset + floors.length) % floors.length;
    onSelect(floors[next].id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex items-center gap-1.5 overflow-x-auto pb-1"
    >
      {floors.map((floor) => {
        const isActive = floor.id === activeFloorId;
        return (
          <button
            key={floor.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(floor.id)}
            onKeyDown={handleKeyDown}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? "bg-btn text-btn-ink font-bold"
                : "bg-surface text-secondary hover:text-primary border border-border"
            }`}
          >
            {floor.name}
          </button>
        );
      })}
    </div>
  );
};
