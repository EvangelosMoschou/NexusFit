import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { trainerRoute } from "@/lib/api";
import { hasSessionPermission } from "@/lib/staffAuth";
import { writeAudit } from "@/lib/audit";
import type { GymConfig } from "@/types";

const CONFIG_PERMISSIONS = ["announcements_manage", "schedule_manage"] as const;

export const GET = trainerRoute(
  async (_req, tenantId) => {
    const config = await getRepository(tenantId).getGymConfig();
    return NextResponse.json({ success: true, config });
  },
  "Failed to fetch config",
  [...CONFIG_PERMISSIONS]
);

export const POST = trainerRoute(
  async (req: NextRequest, tenantId, staff) => {
    const body = await req.json().catch(() => ({}));
    const patch: Partial<GymConfig> = {};

    if (Array.isArray(body?.announcements)) {
      if (!hasSessionPermission(staff, "announcements_manage")) {
        return NextResponse.json(
          { success: false, error: "Δεν έχεις δικαίωμα στις ανακοινώσεις." },
          { status: 403 }
        );
      }
      patch.announcements = body.announcements;
    }

    if (Array.isArray(body?.schedule)) {
      if (!hasSessionPermission(staff, "schedule_manage")) {
        return NextResponse.json(
          { success: false, error: "Δεν έχεις δικαίωμα στο πρόγραμμα." },
          { status: 403 }
        );
      }
      patch.schedule = body.schedule;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { success: false, error: "Δεν υπάρχουν αλλαγές." },
        { status: 400 }
      );
    }

    const repo = getRepository(tenantId);
    const saved = await repo.updateGymConfig(patch);
    if (!saved) {
      return NextResponse.json(
        { success: false, error: "Η αποθήκευση απέτυχε." },
        { status: 500 }
      );
    }

    await writeAudit(req, tenantId, staff, "config.update", "config", null, {
      fields: Object.keys(patch),
    });

    return NextResponse.json({ success: true, config: await repo.getGymConfig() });
  },
  "Failed to save config",
  [...CONFIG_PERMISSIONS]
);
