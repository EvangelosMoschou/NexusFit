// Runs once when the production server boots. It does not block startup: it
// surfaces weak or missing configuration in the logs, where the operator will
// actually see it, instead of letting the first login fail silently.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NODE_ENV !== "production") return;

  const warnings: string[] = [];

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    warnings.push("SESSION_SECRET is missing: member login returns 503.");
  } else if (sessionSecret.length < 32) {
    warnings.push("SESSION_SECRET is shorter than 32 characters; use openssl rand -hex 32.");
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    warnings.push("ADMIN_PASSWORD is missing: /admin returns 503.");
  } else if (adminPassword.length < 12) {
    warnings.push("ADMIN_PASSWORD is shorter than 12 characters.");
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret.length < 32) {
    warnings.push("CRON_SECRET is shorter than 32 characters.");
  }

  if (process.env.DEMO_MODE === "1" || process.env.SEED_DEMO_MEMBERS === "1") {
    warnings.push("DEMO_MODE/SEED_DEMO_MEMBERS is enabled: known demo credentials are active.");
  }

  for (const warning of warnings) {
    console.warn(`[security] ${warning}`);
  }
}
