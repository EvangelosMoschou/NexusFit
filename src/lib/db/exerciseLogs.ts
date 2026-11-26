import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { ExerciseLogInput, ExerciseLogRow } from "./types";

const MAX_EXERCISE_NAME_LEN = 120;
const MAX_WEIGHT_KG = 2000;
const MAX_REPS = 500;

/**
 * Return recent exercise load/rep logs for a member ordered newest-first.
 */
export function listExerciseLogs(
  memberId: string,
  limit: number = 200,
  tenantId: string = DEFAULT_TENANT_ID
): ExerciseLogRow[] {
  if (!memberId) return [];
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit) || 200));
  const db = getDatabase(tenantId);
  return db
    .prepare(
      `SELECT id, member_id, exercise_name, weight_kg, reps, logged_at
       FROM exercise_logs
       WHERE member_id = ?
       ORDER BY logged_at DESC, id DESC
       LIMIT ?`
    )
    .all(memberId, safeLimit) as unknown as ExerciseLogRow[];
}

/**
 * Validate and insert an exercise log row for a member.
 * Returns null if validation fails or the referenced member does not exist.
 */
export function saveExerciseLog(
  memberId: string,
  input: ExerciseLogInput,
  tenantId: string = DEFAULT_TENANT_ID
): ExerciseLogRow | null {
  if (!memberId) return null;

  const exerciseName = typeof input.exerciseName === "string" ? input.exerciseName.trim() : "";
  if (!exerciseName || exerciseName.length > MAX_EXERCISE_NAME_LEN) {
    return null;
  }

  const weightKg = Number(input.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > MAX_WEIGHT_KG) {
    return null;
  }

  const reps = Number(input.reps);
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) {
    return null;
  }

  let loggedAt = new Date().toISOString();
  if (typeof input.loggedAt === "string" && input.loggedAt.trim().length > 0) {
    const parsed = new Date(input.loggedAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    loggedAt = parsed.toISOString();
  }

  const db = getDatabase(tenantId);
  try {
    const result = db
      .prepare(
        `INSERT INTO exercise_logs (member_id, exercise_name, weight_kg, reps, logged_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(memberId, exerciseName, Math.round(weightKg * 100) / 100, reps, loggedAt);

    const row = db
      .prepare(
        `SELECT id, member_id, exercise_name, weight_kg, reps, logged_at
         FROM exercise_logs
         WHERE id = ?`
      )
      .get(Number(result.lastInsertRowid)) as ExerciseLogRow | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}
