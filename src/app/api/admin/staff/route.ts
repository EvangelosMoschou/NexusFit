import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/api";
import { getRepository } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  normalizeStaffPermissions,
  TRAINER_DEFAULT_PERMISSIONS,
} from "@/lib/staffPermissions";
import type { StaffRole, StaffUpdate } from "@/lib/db/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 256;
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 120;
}

function validRole(value: unknown): value is StaffRole {
  return value === "admin" || value === "trainer";
}

export const GET = adminRoute(
  async (_req, tenantId) =>
    NextResponse.json({ success: true, staff: await getRepository(tenantId).listStaff() }),
  "Failed to fetch staff accounts"
);

export const POST = adminRoute(async (req: NextRequest, tenantId, staff) => {
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = cleanEmail(body?.email);
  const role = body?.role;
  const password = body?.password;

  if (!validName(name) || !EMAIL_PATTERN.test(email) || !validRole(role) || !validPassword(password)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Συμπληρώστε όνομα, έγκυρο email, ρόλο και κωδικό τουλάχιστον 8 χαρακτήρων.",
      },
      { status: 400 }
    );
  }

  const repo = getRepository(tenantId);
  if (await repo.getStaffByEmail(email)) {
    return NextResponse.json(
      { success: false, error: "Υπάρχει ήδη λογαριασμός με αυτό το email." },
      { status: 409 }
    );
  }

  const permissions =
    role === "admin"
      ? []
      : Array.isArray(body?.permissions)
        ? normalizeStaffPermissions(body.permissions)
        : [...TRAINER_DEFAULT_PERMISSIONS];

  const account = await repo.createStaff({ name, email, role, password, permissions });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Η δημιουργία λογαριασμού απέτυχε." },
      { status: 500 }
    );
  }

  await writeAudit(req, tenantId, staff, "staff.create", "staff", account.id, {
    role: account.role,
    permissions: account.permissions,
  });
  return NextResponse.json({ success: true, staff: account });
}, "Failed to create staff account");

export const PATCH = adminRoute(async (req: NextRequest, tenantId, self) => {
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing account id" }, { status: 400 });
  }

  const repo = getRepository(tenantId);
  const current = await repo.getStaffById(id);
  if (!current) {
    return NextResponse.json({ success: false, error: "Ο λογαριασμός δεν βρέθηκε." }, { status: 404 });
  }

  const patch: StaffUpdate = {};
  const isSelf = self?.id === id;

  if (body?.name !== undefined) {
    if (!validName(body.name)) {
      return NextResponse.json({ success: false, error: "Μη έγκυρο όνομα." }, { status: 400 });
    }
    patch.name = body.name.trim();
  }

  if (body?.email !== undefined) {
    const email = cleanEmail(body.email);
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ success: false, error: "Μη έγκυρο email." }, { status: 400 });
    }
    const existing = await repo.getStaffByEmail(email);
    if (existing && existing.id !== id) {
      return NextResponse.json(
        { success: false, error: "Υπάρχει ήδη λογαριασμός με αυτό το email." },
        { status: 409 }
      );
    }
    patch.email = email;
  }

  if (body?.role !== undefined) {
    if (!validRole(body.role)) {
      return NextResponse.json({ success: false, error: "Μη έγκυρος ρόλος." }, { status: 400 });
    }
    if (isSelf && body.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Δεν μπορείς να αφαιρέσεις τον εαυτό σου από διαχειριστή." },
        { status: 400 }
      );
    }
    patch.role = body.role;
  }

  if (body?.password !== undefined) {
    if (!validPassword(body.password)) {
      return NextResponse.json(
        { success: false, error: "Ο κωδικός πρέπει να είναι τουλάχιστον 8 χαρακτήρες." },
        { status: 400 }
      );
    }
    patch.password = body.password;
  }

  if (body?.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ success: false, error: "Μη έγκυρη κατάσταση." }, { status: 400 });
    }
    if (isSelf && body.active === false) {
      return NextResponse.json(
        { success: false, error: "Δεν μπορείς να απενεργοποιήσεις τον εαυτό σου." },
        { status: 400 }
      );
    }
    patch.active = body.active;
  }

  if (body?.permissions !== undefined) {
    patch.permissions = normalizeStaffPermissions(body.permissions);
  }

  const nextRole = patch.role ?? current.role;
  if (nextRole === "admin") {
    patch.permissions = [];
  } else if (patch.role === "trainer" && !Array.isArray(body?.permissions)) {
    patch.permissions =
      current.role === "admin" ? [...TRAINER_DEFAULT_PERMISSIONS] : current.permissions;
  }

  const account = await repo.updateStaff(id, patch);
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Η ενημέρωση απέτυχε." },
      { status: 500 }
    );
  }

  await writeAudit(req, tenantId, self, "staff.update", "staff", id, {
    fields: Object.keys(body).filter((key) => key !== "id"),
    role: account.role,
  });
  return NextResponse.json({ success: true, staff: account });
}, "Failed to update staff account");

export const DELETE = adminRoute(async (req: NextRequest, tenantId, self) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing account id" }, { status: 400 });
  }

  if (self?.id === id) {
    return NextResponse.json(
      { success: false, error: "Δεν μπορείς να διαγράψεις τον δικό σου λογαριασμό." },
      { status: 400 }
    );
  }

  const repo = getRepository(tenantId);
  const current = await repo.getStaffById(id);
  if (!current) {
    return NextResponse.json({ success: false, error: "Ο λογαριασμός δεν βρέθηκε." }, { status: 404 });
  }

  const deleted = await repo.deleteStaff(id);
  if (!deleted) {
    return NextResponse.json({ success: false, error: "Ο λογαριασμός δεν βρέθηκε." }, { status: 404 });
  }

  // Keep the accountability history but remove the deleted person's identifiers.
  await repo.anonymizeStaffAudit(id);
  await writeAudit(req, tenantId, self, "staff.delete", "staff", id, {
    role: current.role,
  });

  return NextResponse.json({ success: true });
}, "Failed to delete staff account");
