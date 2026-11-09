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

  const trainerPassword = process.env.TRAINER_PASSWORD;
  if (!trainerPassword) {
    warnings.push(
      "TRAINER_PASSWORD is missing: the legacy shared trainer login is disabled; staff accounts still work."
    );
  } else if (trainerPassword.length < 12) {
    warnings.push("TRAINER_PASSWORD is shorter than 12 characters.");
  }

  const accessControlKey = process.env.ACCESS_CONTROL_KEY;
  if (!accessControlKey) {
    warnings.push("ACCESS_CONTROL_KEY is missing: QR access and /api/access/scan are disabled.");
  } else if (accessControlKey.length < 16) {
    warnings.push("ACCESS_CONTROL_KEY is shorter than 16 characters.");
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret.length < 32) {
    warnings.push("CRON_SECRET is shorter than 32 characters.");
  }

  const memberSessionTimeouts: Array<[string, number]> = [
    ["MEMBER_SESSION_IDLE_SECONDS", 60],
    ["MEMBER_SESSION_ABSOLUTE_SECONDS", 60],
    ["MEMBER_SESSION_TOUCH_SECONDS", 60],
  ];
  for (const [name, minimum] of memberSessionTimeouts) {
    const raw = process.env[name];
    if (raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum) {
      warnings.push(`${name} must be an integer >= ${minimum}; using the default.`);
    }
  }

  const idle = Number(process.env.MEMBER_SESSION_IDLE_SECONDS);
  const absolute = Number(process.env.MEMBER_SESSION_ABSOLUTE_SECONDS);
  if (Number.isInteger(idle) && Number.isInteger(absolute) && idle > absolute) {
    warnings.push("MEMBER_SESSION_IDLE_SECONDS is greater than MEMBER_SESSION_ABSOLUTE_SECONDS.");
  }

  const maxActive = process.env.MEMBER_SESSION_MAX_ACTIVE;
  if (maxActive !== undefined) {
    const value = Number(maxActive);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      warnings.push("MEMBER_SESSION_MAX_ACTIVE must be an integer between 1 and 100; using 10.");
    }
  }

  if (process.env.DEMO_MODE === "1" || process.env.SEED_DEMO_MEMBERS === "1") {
    warnings.push("DEMO_MODE/SEED_DEMO_MEMBERS is enabled: known demo credentials are active.");
  }

  for (const warning of warnings) {
    console.warn(`[security] ${warning}`);
  }
}
