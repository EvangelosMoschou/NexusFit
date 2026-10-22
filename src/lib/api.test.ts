import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

// Isolated data directory so the tenant registry never touches the real data/.
const tempDir = mkdtempSync(path.join(tmpdir(), "nexusfit-api-"));
process.env.SQLITE_DATA_DIR = tempDir;
process.env.ADMIN_PASSWORD = "test-admin-password";

import { adminRoute, jsonError, jsonOk } from "./api";
import { adminSessionToken } from "./adminAuth";
import { createTenant } from "./tenants";
import { DEFAULT_TENANT_ID } from "./sqliteDb";

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const adminToken = adminSessionToken(DEFAULT_TENANT_ID)!;

// A hand-built Request does not carry a `host` header, so set it (plus the
// proxy-forwarded variant the resolver also accepts) explicitly.
const makeRequest = (cookie?: string, host = "localhost") => {
  const headers: Record<string, string> = { host, "x-forwarded-host": host };
  if (cookie) headers.cookie = cookie;

  return new NextRequest(`http://${host}/api/admin/config`, { headers });
};

describe("adminRoute", () => {
  it("rejects requests without an admin session cookie", async () => {
    const handler = adminRoute(() => NextResponse.json({ success: true }), "boom");
    const res = await handler(makeRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
  });

  it("rejects requests with a tampered cookie", async () => {
    const handler = adminRoute(() => NextResponse.json({ success: true }), "boom");
    const res = await handler(makeRequest("nexusfit_admin=deadbeef"));

    expect(res.status).toBe(401);
  });

  it("lets authenticated requests through to the handler", async () => {
    const handler = adminRoute(
      () => NextResponse.json({ success: true, config: { gymName: "NEXUS" } }),
      "boom"
    );
    const res = await handler(makeRequest(`nexusfit_admin=${adminToken}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, config: { gymName: "NEXUS" } });
  });

  it("wraps handler errors in a 500 envelope with the given message", async () => {
    const handler = adminRoute(
      () => {
        throw new Error("db down");
      },
      "Failed to load config"
    );
    const res = await handler(makeRequest(`nexusfit_admin=${adminToken}`));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: "Failed to load config" });
  });
});

describe("adminRoute tenant isolation", () => {
  it("hands the resolved tenant to the handler", async () => {
    const handler = adminRoute(
      (_req, tenantId) => NextResponse.json({ success: true, tenantId }),
      "boom"
    );
    const res = await handler(makeRequest(`nexusfit_admin=${adminToken}`));

    expect(await res.json()).toEqual({ success: true, tenantId: DEFAULT_TENANT_ID });
  });

  it("does not accept one tenant's admin session on another tenant's host", async () => {
    expect(
      createTenant({
        id: "gym-a",
        name: "Gym A",
        domains: ["gym-a.test"],
        adminPassword: "secret-a",
      })
    ).toBe(true);

    const handler = adminRoute(
      (_req, tenantId) => NextResponse.json({ success: true, tenantId }),
      "boom"
    );

    const gymAToken = adminSessionToken("gym-a")!;

    // Gym A's own session works on its host...
    const allowed = await handler(makeRequest(`nexusfit_admin=${gymAToken}`, "gym-a.test"));
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ success: true, tenantId: "gym-a" });

    // ...but the default tenant's session must not unlock gym-a.
    const crossTenant = await handler(makeRequest(`nexusfit_admin=${adminToken}`, "gym-a.test"));
    expect(crossTenant.status).toBe(401);
  });
});

describe("json envelope helpers", () => {
  it("jsonOk returns success:true with merged data", async () => {
    const res = jsonOk({ config: { gymName: "NEXUS" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, config: { gymName: "NEXUS" } });
  });

  it("jsonError returns success:false with a stable code and optional message", async () => {
    const res = jsonError("Not authenticated", 401);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Not authenticated" });

    const withMessage = jsonError("Rate limited", 429, "Πολλές αιτήσεις.");
    expect(await withMessage.json()).toEqual({
      success: false,
      error: "Rate limited",
      message: "Πολλές αιτήσεις.",
    });
  });
});
