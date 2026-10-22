import { Repository } from "./repository";
import { createSqliteRepository } from "./sqliteRepository";
import { DEFAULT_TENANT_ID } from "@/lib/sqliteDb";

export * from "./repository";
export * from "./types";

// One repository instance per tenant, cached so the wrapper is not rebuilt on
// every request.
const repositories = new Map<string, Repository>();

// Returns the active data-store implementation for a tenant.
//
// Each tenant gets a repository bound to its own database, so a caller cannot
// accidentally reach another gym's data. Defaults to the default tenant, which
// keeps single-gym deployments and local development working unchanged.
export function getRepository(tenantId: string = DEFAULT_TENANT_ID): Repository {
  const existing = repositories.get(tenantId);
  if (existing) return existing;

  const repository = createSqliteRepository(tenantId);
  repositories.set(tenantId, repository);
  return repository;
}
