/**
 * Public surface of the portable gym floor-plan module.
 *
 * Host apps should import from this file only:
 *
 * ```ts
 * import {
 *   createEmptyPlan,
 *   addCategory,
 *   addFloor,
 *   setCell,
 *   serializePlan,
 *   deserializePlan,
 *   encodePlanBytes,
 *   decodePlanBytes,
 *   buildFloorRenderModel,
 * } from "@/modules/gym-floor-plan";
 * ```
 *
 * No module file imports from `@/lib`, `@/config` or `@/types`; persistence and
 * theming are injected through `FloorPlanStorageAdapter` / `FloorPlanTheme`.
 */

export * from "./types";
export * from "./model";
export * from "./render";
export * from "./renderSvg";
export * from "./wireBinary";
