// Boolean-ish environment flags: "1", "true" and "yes" all count as enabled.
export function envFlag(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

// Demo mode makes a throwaway deployment usable with a single variable: it
// seeds the demo members and accepts the known demo admin password. It must
// never be enabled for a real gym deployment.
export function isDemoMode(): boolean {
  return envFlag(process.env.DEMO_MODE);
}
