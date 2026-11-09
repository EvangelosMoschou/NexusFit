// A subscription is usable when the admin has marked it active and its date is
// not in the past. Dates are stored as YYYY-MM-DD, so a string comparison is
// enough and avoids timezone drift at the day boundary.
export function isSubscriptionActive(
  status: string | null | undefined,
  expiresAt: string | null | undefined
): boolean {
  if (status !== "active") return false;
  if (!expiresAt) return true;
  const today = new Date().toISOString().slice(0, 10);
  return expiresAt.slice(0, 10) >= today;
}

// Occupancy and its forecast are premium features. In this template the
// premium tier is the digital/AI-inclusive tier (`has_ai_access = 1`).
// The column comes back from SQLite as 0/1 but callers that already mapped it
// pass a boolean, so both forms mean "premium".
export function isPremiumSubscriptionActive(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
  hasAIAccess: number | boolean | null | undefined
): boolean {
  return isSubscriptionActive(status, expiresAt) && (hasAIAccess === 1 || hasAIAccess === true);
}
