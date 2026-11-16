/**
 * Client for the floor-plan endpoints.
 *
 * Kept in one place so the public display and the admin editor agree on the
 * envelope, and so neither component has to know how to interpret a failed
 * request. The contract:
 *
 *   GET    /api/floor-plan        -> { success, plan: GymFloorPlan | null, updatedAt }
 *   GET    /api/admin/floor-plan  -> { success, plan: GymFloorPlan | null, invalid? }
 *   POST   /api/admin/floor-plan  -> body { plan } -> { success, warnings }
 *                                    400 -> { success: false, issues }
 *   DELETE /api/admin/floor-plan  -> { success }
 *
 * Responses are validated with the module's `parsePlanValue` rather than cast:
 * the browser is not the only writer, and a hand-edited row must not crash the
 * landing page.
 */

import { parsePlanValue, type GymFloorPlan, type ValidationIssue } from "@/modules/gym-floor-plan";

export interface LoadedFloorPlan {
  plan: GymFloorPlan | null;
  updatedAt: string | null;
  /** True when the server holds a stored plan that fails validation. */
  invalid: boolean;
}

export interface SavedFloorPlan {
  warnings: ValidationIssue[];
}

/**
 * The Greek message shown when the plan could not be loaded and the server sent
 * no explanation of its own.
 *
 * Exported because the admin tab needs the same sentence twice: as the message
 * of a thrown-but-unrecognised error, and as the fallback of the error panel.
 * Three independent copies used to exist and could drift apart in one edit.
 */
export const FLOOR_PLAN_LOAD_ERROR = "Δεν ήταν δυνατή η φόρτωση της κάτοψης.";

/** A failed request, carrying the module's issues when the server sent them. */
export class FloorPlanRequestError extends Error {
  readonly status: number;
  readonly issues: ValidationIssue[];

  constructor(message: string, status: number, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "FloorPlanRequestError";
    this.status = status;
    this.issues = issues;
  }
}

interface FloorPlanEnvelope {
  success?: unknown;
  plan?: unknown;
  updatedAt?: unknown;
  invalid?: unknown;
  warnings?: unknown;
  issues?: unknown;
  error?: unknown;
  message?: unknown;
}

function isIssueArray(value: unknown): value is ValidationIssue[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "object" && entry !== null && "message" in entry)
  );
}

async function readJson(response: Response): Promise<FloorPlanEnvelope | null> {
  const parsed: unknown = await response.json().catch(() => null);
  if (typeof parsed !== "object" || parsed === null) return null;
  return parsed as FloorPlanEnvelope;
}

/** Human-readable failure text from the envelope, with a Greek fallback. */
function describeFailure(envelope: FloorPlanEnvelope | null, fallback: string): string {
  if (envelope && typeof envelope.message === "string" && envelope.message.length > 0) {
    return envelope.message;
  }
  if (envelope && typeof envelope.error === "string" && envelope.error.length > 0) {
    return envelope.error;
  }
  return fallback;
}

/**
 * Loads the plan. A missing plan is a normal answer (`plan: null`), not an
 * error: the gym may simply not have drawn one yet.
 */
export async function loadFloorPlan(
  url: string,
  options: { cache?: RequestCache } = {}
): Promise<LoadedFloorPlan> {
  // No default `cache` override: the public endpoint sends its own
  // `Cache-Control` (public, max-age=60, stale-while-revalidate=300) and should
  // be allowed to use it, while the admin caller passes `no-store` explicitly
  // because it must never see a stale editor state.
  const response = await fetch(url, {
    ...(options.cache === undefined ? {} : { cache: options.cache }),
    headers: { Accept: "application/json" },
  });
  const envelope = await readJson(response);

  // 304 is the browser's own revalidation echo: it only reaches `fetch` when the
  // caller supplied `If-None-Match`, and the cached body is reused, so there is
  // no plan to parse and nothing to report. Every other non-2xx is a failure.
  if (response.status === 304) {
    return { plan: null, updatedAt: null, invalid: false };
  }

  if (!response.ok || envelope?.success !== true) {
    throw new FloorPlanRequestError(
      describeFailure(envelope, FLOOR_PLAN_LOAD_ERROR),
      response.status,
      isIssueArray(envelope?.issues) ? envelope.issues : []
    );
  }

  const updatedAt =
    typeof envelope.updatedAt === "string" && envelope.updatedAt.length > 0
      ? envelope.updatedAt
      : null;
  const invalid = envelope.invalid === true;

  if (envelope.plan === null || envelope.plan === undefined) {
    return { plan: null, updatedAt, invalid };
  }

  const result = parsePlanValue(envelope.plan);
  if (!result.ok) {
    return { plan: null, updatedAt, invalid: true };
  }
  return { plan: result.plan, updatedAt, invalid };
}

/** Saves the plan; validation failures surface as `FloorPlanRequestError`. */
export async function saveFloorPlan(url: string, plan: GymFloorPlan): Promise<SavedFloorPlan> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ plan }),
  });
  const envelope = await readJson(response);

  if (!response.ok || envelope?.success !== true) {
    throw new FloorPlanRequestError(
      describeFailure(envelope, "Η αποθήκευση της κάτοψης απέτυχε."),
      response.status,
      isIssueArray(envelope?.issues) ? envelope.issues : []
    );
  }

  return { warnings: isIssueArray(envelope.warnings) ? envelope.warnings : [] };
}

/** Clears the stored plan (the DELETE endpoint is idempotent). */
export async function clearFloorPlan(url: string): Promise<void> {
  const response = await fetch(url, { method: "DELETE", headers: { Accept: "application/json" } });
  const envelope = await readJson(response);

  if (!response.ok || envelope?.success !== true) {
    throw new FloorPlanRequestError(
      describeFailure(envelope, "Η διαγραφή της κάτοψης απέτυχε."),
      response.status,
      isIssueArray(envelope?.issues) ? envelope.issues : []
    );
  }
}
