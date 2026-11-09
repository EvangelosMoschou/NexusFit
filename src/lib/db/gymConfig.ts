import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import { defaultGymConfig } from "@/config/gymConfig";
import type { GymConfig } from "@/types";

// The admin-editable gym configuration, stored as one JSON row in site_config.
// Reading it merges the saved value over the current defaults so a config
// persisted before a new field existed still resolves that field.

export function getSavedGymConfig(tenantId: string = DEFAULT_TENANT_ID): GymConfig {
  try {
    const db = getDatabase(tenantId);
    const stmt = db.prepare("SELECT value FROM site_config WHERE key = 'gym_config'");
    const row = stmt.get() as { value: string } | undefined;
    if (row && row.value) {
      try {
        // Merge over the defaults so a config persisted before a new field
        // existed (e.g. `legal`) still resolves that field for existing installs
        // instead of dropping it. New mandatory legal sections are appended so
        // existing tenants receive cookie/staff/deletion disclosures too.
        const saved = JSON.parse(row.value) as Partial<GymConfig>;
        const merged: GymConfig = { ...defaultGymConfig, ...saved };
        const savedPrivacy = saved.legal?.privacy;
        const savedTos = saved.legal?.tos;

        // Cookie, retention and security disclosures are mandatory: always use
        // the current default bodies for those titles, preserve custom
        // sections, and append newly introduced sections.
        const mandatoryTitles = new Set([
          "3. Cookies & Τοπική Αποθήκευση",
          "5. Διατήρηση Δεδομένων",
          "7. Ασφάλεια",
        ]);
        const privacy = Array.isArray(savedPrivacy)
          ? (() => {
              const savedByTitle = new Map(savedPrivacy.map((section) => [section.title, section]));
              const defaultTitles = new Set(
                defaultGymConfig.legal.privacy.map((section) => section.title)
              );
              return [
                ...defaultGymConfig.legal.privacy.map((section) =>
                  mandatoryTitles.has(section.title)
                    ? section
                    : (savedByTitle.get(section.title) ?? section)
                ),
                ...savedPrivacy.filter((section) => !defaultTitles.has(section.title)),
              ];
            })()
          : defaultGymConfig.legal.privacy;

        const tos = Array.isArray(savedTos)
          ? (() => {
              const titles = new Set(savedTos.map((section) => section.title));
              return [
                ...savedTos,
                ...defaultGymConfig.legal.tos.filter((section) => !titles.has(section.title)),
              ];
            })()
          : defaultGymConfig.legal.tos;

        merged.legal = { tos, privacy };

        // Move the previous template's default address (Athens) to the current
        // White Tower template, but never overwrite a custom address.
        const previousDefaultAddress = "Λεωφόρος Βουλιαγμένης 128, Γλυφάδα";
        const migratedTemplateAddress =
          saved.address === previousDefaultAddress && saved.city === "Αθήνα";
        if (migratedTemplateAddress) {
          merged.address = defaultGymConfig.address;
          merged.city = defaultGymConfig.city;
          if (!saved.phone) merged.phone = defaultGymConfig.phone;
          merged.latitude = defaultGymConfig.latitude;
          merged.longitude = defaultGymConfig.longitude;

          const controller = merged.legal.privacy.find((section) => section.title.startsWith("1."));
          if (controller?.body.includes("Λεωφόρος Βουλιαγμένης 128")) {
            merged.legal.privacy = merged.legal.privacy.map((section) =>
              section === controller
                ? (defaultGymConfig.legal.privacy.find((item) => item.title.startsWith("1.")) ??
                  section)
                : section
            );
          }
        }

        // Do not point an older custom saved address at the new template coordinates.
        if (
          !migratedTemplateAddress &&
          saved.address &&
          (saved.latitude === undefined || saved.longitude === undefined)
        ) {
          merged.latitude = undefined;
          merged.longitude = undefined;
        }

        return merged;
      } catch (err) {
        console.error("[sqliteDb] parseGymConfigJson failed:", err);
      }
    }
  } catch (err) {
    console.error("[sqliteDb] getSavedGymConfig failed:", err);
  }
  return defaultGymConfig;
}

export function updateSavedGymConfig(
  config: Partial<GymConfig>,
  tenantId: string = DEFAULT_TENANT_ID
): boolean {
  try {
    const db = getDatabase(tenantId);
    const current = getSavedGymConfig(tenantId);
    const merged: GymConfig = { ...current, ...config };

    const stmt = db.prepare(`
      INSERT INTO site_config (key, value, updated_at) 
      VALUES ('gym_config', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(JSON.stringify(merged), new Date().toISOString());
    return true;
  } catch (err) {
    console.error("[sqliteDb] updateSavedGymConfig failed:", err);
    return false;
  }
}
