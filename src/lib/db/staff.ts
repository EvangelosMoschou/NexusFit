import { randomUUID } from "node:crypto";
import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { DbStaffAccount, StaffAccount, StaffInput, StaffRole, StaffUpdate } from "./types";
import { hashPin } from "@/lib/passwordHash";

// Named staff accounts (admin/trainer). Password hashes never leave this module
// except through getStaffAccountByEmail, which the auth layer needs to verify a
// login.

function parseStaffPermissions(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function rowToStaffAccount(row: Record<string, unknown>): DbStaffAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: (row.role === "admin" ? "admin" : "trainer") as StaffRole,
    permissions: parseStaffPermissions(row.permissions),
    active: Number(row.active) === 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_login_at: row.last_login_at ? String(row.last_login_at) : null,
    password_hash: String(row.password_hash),
  };
}

function toPublicStaffAccount(account: DbStaffAccount): StaffAccount {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    permissions: account.permissions,
    active: account.active,
    created_at: account.created_at,
    updated_at: account.updated_at,
    last_login_at: account.last_login_at,
  };
}

export function listStaffAccounts(tenantId: string = DEFAULT_TENANT_ID): StaffAccount[] {
  try {
    const db = getDatabase(tenantId);
    return (
      db.prepare("SELECT * FROM staff_accounts ORDER BY created_at ASC").all() as Record<
        string,
        unknown
      >[]
    ).map((row) => toPublicStaffAccount(rowToStaffAccount(row)));
  } catch (err) {
    console.error("[sqliteDb] listStaffAccounts failed:", err);
    return [];
  }
}

export function getStaffAccountById(
  id: string,
  tenantId: string = DEFAULT_TENANT_ID
): DbStaffAccount | null {
  try {
    const db = getDatabase(tenantId);
    const row = db.prepare("SELECT * FROM staff_accounts WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;
    return row ? rowToStaffAccount(row) : null;
  } catch (err) {
    console.error("[sqliteDb] getStaffAccountById failed:", err);
    return null;
  }
}

export function getStaffAccountByEmail(
  email: string,
  tenantId: string = DEFAULT_TENANT_ID
): DbStaffAccount | null {
  try {
    const db = getDatabase(tenantId);
    const normalized = email.trim().toLowerCase();
    const row = db.prepare("SELECT * FROM staff_accounts WHERE email = ?").get(normalized) as
      Record<string, unknown> | undefined;
    return row ? rowToStaffAccount(row) : null;
  } catch (err) {
    console.error("[sqliteDb] getStaffAccountByEmail failed:", err);
    return null;
  }
}

export async function createStaffAccount(
  input: StaffInput,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<StaffAccount | null> {
  try {
    const db = getDatabase(tenantId);
    const id = `staff-${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO staff_accounts
         (id, name, email, role, password_hash, permissions, active, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.name.trim(),
      input.email.trim().toLowerCase(),
      input.role,
      await hashPin(input.password),
      JSON.stringify(input.permissions ?? []),
      1,
      now,
      now,
      null
    );

    const account = getStaffAccountById(id, tenantId);
    return account ? toPublicStaffAccount(account) : null;
  } catch (err) {
    console.error("[sqliteDb] createStaffAccount failed:", err);
    return null;
  }
}

export async function updateStaffAccount(
  id: string,
  patch: StaffUpdate,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<StaffAccount | null> {
  try {
    const db = getDatabase(tenantId);
    const current = getStaffAccountById(id, tenantId);
    if (!current) return null;

    const fields: string[] = [];
    const values: Array<string | number> = [];

    if (typeof patch.name === "string") {
      fields.push("name = ?");
      values.push(patch.name.trim());
    }
    if (typeof patch.email === "string") {
      fields.push("email = ?");
      values.push(patch.email.trim().toLowerCase());
    }
    if (patch.role === "admin" || patch.role === "trainer") {
      fields.push("role = ?");
      values.push(patch.role);
    }
    if (typeof patch.password === "string") {
      fields.push("password_hash = ?");
      values.push(await hashPin(patch.password));
    }
    if (Array.isArray(patch.permissions)) {
      fields.push("permissions = ?");
      values.push(JSON.stringify(patch.permissions));
    }
    if (typeof patch.active === "boolean") {
      fields.push("active = ?");
      values.push(patch.active ? 1 : 0);
    }

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());

    db.prepare(`UPDATE staff_accounts SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);

    const account = getStaffAccountById(id, tenantId);
    return account ? toPublicStaffAccount(account) : null;
  } catch (err) {
    console.error("[sqliteDb] updateStaffAccount failed:", err);
    return null;
  }
}

export function deleteStaffAccount(id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db.prepare("DELETE FROM staff_accounts WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] deleteStaffAccount failed:", err);
    return false;
  }
}

export function touchStaffLogin(id: string, tenantId: string = DEFAULT_TENANT_ID): void {
  try {
    const db = getDatabase(tenantId);
    const now = new Date().toISOString();
    db.prepare("UPDATE staff_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?").run(
      now,
      now,
      id
    );
  } catch (err) {
    console.error("[sqliteDb] touchStaffLogin failed:", err);
  }
}
