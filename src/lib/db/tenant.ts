// The tenant every deployment falls back to when the request host is unknown.
// It deliberately keeps the original single-database path so an existing
// single-gym deployment keeps its data.
export const DEFAULT_TENANT_ID = "default";
