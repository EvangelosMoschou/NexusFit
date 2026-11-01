import type { StaffRole } from "@/lib/db/types";

export const STAFF_PERMISSION_DEFINITIONS = [
  {
    key: "members_view",
    label: "Προβολή μελών",
    description: "Πρόσβαση στη λίστα μελών και στα προφίλ τους (barcode, προγράμματα, παρουσίες).",
  },
  {
    key: "occupancy_view",
    label: "Προβολή παρουσιών",
    description: "Προβολή πληρότητας και ποιοι είναι μέσα.",
  },
  {
    key: "occupancy_manage",
    label: "Check-in / check-out",
    description: "Καταγραφή εισόδου και εξόδου μελών από το γραφείο.",
  },
  {
    key: "announcements_manage",
    label: "Διαχείριση ανακοινώσεων",
    description: "Δημιουργία και επεξεργασία ανακοινώσεων γυμναστηρίου.",
  },
  {
    key: "schedule_manage",
    label: "Διαχείριση ωρολογίου",
    description: "Επεξεργασία εβδομαδιαίου προγράμματος μαθημάτων.",
  },
] as const;

export type StaffPermission = (typeof STAFF_PERMISSION_DEFINITIONS)[number]["key"];

export const ALL_STAFF_PERMISSIONS: StaffPermission[] = STAFF_PERMISSION_DEFINITIONS.map(
  (permission) => permission.key
);

export const TRAINER_DEFAULT_PERMISSIONS: StaffPermission[] = [
  "members_view",
  "occupancy_view",
  "occupancy_manage",
];

// The single shared TRAINER_PASSWORD keeps the original trainer capabilities.
export const LEGACY_TRAINER_PERMISSIONS: StaffPermission[] = [...TRAINER_DEFAULT_PERMISSIONS];

const permissionKeys = new Set<string>(ALL_STAFF_PERMISSIONS);

export function normalizeStaffPermissions(input: unknown): StaffPermission[] {
  if (!Array.isArray(input)) return [];
  const selected = new Set<StaffPermission>();
  for (const value of input) {
    if (typeof value === "string" && permissionKeys.has(value)) {
      selected.add(value as StaffPermission);
    }
  }
  if (selected.has("occupancy_manage")) selected.add("occupancy_view");
  return ALL_STAFF_PERMISSIONS.filter((key) => selected.has(key));
}

export function hasStaffPermission(
  role: StaffRole,
  permissions: string[],
  permission: StaffPermission
): boolean {
  return role === "admin" || permissions.includes(permission);
}

export function permissionsForRole(
  role: StaffRole,
  permissions: string[]
): StaffPermission[] {
  if (role === "admin") return [...ALL_STAFF_PERMISSIONS];
  return normalizeStaffPermissions(permissions);
}
