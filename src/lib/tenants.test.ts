import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-tenant-"));
process.env.SQLITE_DATA_DIR = tempDir;
process.env.ADMIN_PASSWORD = "default-admin-pw";

import { getRepository } from "./db";
import {
  adminSeedPassword,
  createTenant,
  getTenant,
  listTenants,
  resolveTenantId,
} from "./tenants";
import { DEFAULT_TENANT_ID } from "./sqliteDb";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("tenant registry", () => {
  it("seeds a default tenant so single-gym deployments keep working", () => {
    const tenant = getTenant(DEFAULT_TENANT_ID);
    expect(tenant).not.toBeNull();
    expect(listTenants().some((t) => t.id === DEFAULT_TENANT_ID)).toBe(true);
  });

  it("maps a registered domain to its tenant, ignoring case and port", () => {
    expect(
      createTenant({
        id: "iron",
        name: "Iron Gym",
        domains: ["iron.example.com"],
        adminPassword: "pw",
      })
    ).toBe(true);

    expect(resolveTenantId("iron.example.com")).toBe("iron");
    expect(resolveTenantId("iron.example.com:443")).toBe("iron");
    expect(resolveTenantId("IRON.EXAMPLE.COM")).toBe("iron");
    expect(resolveTenantId("  iron.example.com  ")).toBe("iron");
  });

  it("falls back to the default tenant for unknown, empty or missing hosts", () => {
    expect(resolveTenantId("localhost")).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId("10.0.0.1:3000")).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId("someone-elses-domain.test")).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId(null)).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId(undefined)).toBe(DEFAULT_TENANT_ID);
    expect(resolveTenantId("")).toBe(DEFAULT_TENANT_ID);
  });

  it("refuses duplicate tenant ids, taken domains and invalid ids", () => {
    expect(
      createTenant({ id: "iron", name: "Duplicate", domains: ["other.test"], adminPassword: "pw" })
    ).toBe(false);

    expect(
      createTenant({ id: "another", name: "Domain clash", domains: ["iron.example.com"], adminPassword: "pw" })
    ).toBe(false);

    expect(createTenant({ id: "BAD ID", name: "Bad", adminPassword: "pw" })).toBe(false);
    expect(createTenant({ id: "ok-id", name: "", adminPassword: "pw" })).toBe(false);
    expect(createTenant({ id: "ok-id", name: "No password", adminPassword: "" })).toBe(false);
  });
});

describe("default tenant admin seed", () => {
  it("requires ADMIN_PASSWORD in production instead of falling back to a known password", () => {
    expect(adminSeedPassword("production", undefined)).toBeNull();
    expect(adminSeedPassword("production", "")).toBeNull();
    expect(adminSeedPassword("production", "s3cret-admin")).toBe("s3cret-admin");
  });

  it("keeps the development fallback", () => {
    expect(adminSeedPassword("development", undefined)).toBe("admin");
    expect(adminSeedPassword(undefined, undefined)).toBe("admin");
  });

  it("uses the demo password only when demo mode is explicit", () => {
    expect(adminSeedPassword("production", undefined, true)).toBe("admin1");
    expect(adminSeedPassword("production", "real-password", true)).toBe("real-password");
    expect(adminSeedPassword("development", undefined, true)).toBe("admin1");
  });
});

describe("tenant data isolation", () => {
  const secondTenant = "isolation-gym";

  it("keeps leads separate per tenant", async () => {
    createTenant({ id: secondTenant, name: "Isolation Gym", adminPassword: "pw-iso" });

    const email = `iso-lead-${Date.now()}@example.com`;
    expect(await getRepository(secondTenant).saveLead({ fullName: "Iso Lead", email })).toBe(true);

    expect((await getRepository(secondTenant).listLeads()).some((l) => l.email === email)).toBe(true);
    expect((await getRepository(DEFAULT_TENANT_ID).listLeads()).some((l) => l.email === email)).toBe(false);
  });

  it("keeps the gym config separate per tenant", async () => {
    expect(await getRepository(secondTenant).updateGymConfig({ gymName: "ISOLATION GYM" })).toBe(true);

    expect((await getRepository(secondTenant).getGymConfig()).gymName).toBe("ISOLATION GYM");
    expect((await getRepository(DEFAULT_TENANT_ID).getGymConfig()).gymName).toBe("NEXUS ATHLETICS");
  });

  it("keeps members separate per tenant", async () => {
    const code = `NX-ISO-${Date.now()}`;
    expect(
      await getRepository(secondTenant).saveMember({
        memberCode: code,
        fullName: "Iso Member",
        email: `iso-member-${Date.now()}@example.com`,
        pinCode: "4321",
        tierName: "Standard",
        hasAIAccess: false,
        subscriptionStatus: "active",
        expiresAt: "2027-01-01",
      })
    ).toBe(true);

    expect((await getRepository(secondTenant).listMembers()).some((m) => m.member_code === code)).toBe(true);
    expect((await getRepository(DEFAULT_TENANT_ID).listMembers()).some((m) => m.member_code === code)).toBe(false);
  });

  it("cannot authenticate one tenant's member against another tenant", async () => {
    // The seeded demo member exists only in the default tenant's database.
    expect(await getRepository(DEFAULT_TENANT_ID).authenticateMember("NX-8492", "1234")).not.toBeNull();
    expect(await getRepository(secondTenant).authenticateMember("NX-8492", "1234")).toBeNull();
  });
});
