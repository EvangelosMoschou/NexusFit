import { describe, expect, it } from "vitest";
import {
  ALL_STAFF_PERMISSIONS,
  hasStaffPermission,
  normalizeStaffPermissions,
  permissionsForRole,
  TRAINER_DEFAULT_PERMISSIONS,
} from "./staffPermissions";

describe("staff permissions", () => {
  it("drops unknown permissions and keeps known ones", () => {
    expect(normalizeStaffPermissions(["members_view", "nope", 42])).toEqual([
      "members_view",
    ]);
  });

  it("makes check-in/out imply occupancy view", () => {
    expect(normalizeStaffPermissions(["occupancy_manage"])).toEqual([
      "occupancy_view",
      "occupancy_manage",
    ]);
  });

  it("gives admins every permission and keeps trainer defaults", () => {
    expect(permissionsForRole("admin", [])).toEqual(ALL_STAFF_PERMISSIONS);
    expect(permissionsForRole("trainer", [...TRAINER_DEFAULT_PERMISSIONS])).toEqual(
      TRAINER_DEFAULT_PERMISSIONS
    );
    expect(hasStaffPermission("admin", [], "schedule_manage")).toBe(true);
    expect(hasStaffPermission("trainer", ["members_view"], "members_view")).toBe(true);
    expect(hasStaffPermission("trainer", ["members_view"], "schedule_manage")).toBe(false);
  });
});
