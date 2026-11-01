"use client";

import React from "react";
import { Clock, Mail, MapPin, Navigation, Phone } from "lucide-react";
import { useGymConfig } from "@/lib/useGymConfig";
import { openDirections } from "@/lib/maps";

export const GymMap: React.FC = () => {
  const { config } = useGymConfig();

  const hasCoordinates =
    typeof config.latitude === "number" &&
    Number.isFinite(config.latitude) &&
    typeof config.longitude === "number" &&
    Number.isFinite(config.longitude);

  const addressLine = [config.address, config.city].filter(Boolean).join(", ");
  const phoneHref = config.phone
    ? `tel:${config.phone.replace(/[^\d+]/g, "")}`
    : undefined;

  const embedUrl = hasCoordinates
    ? (() => {
        const lat = config.latitude as number;
        const lon = config.longitude as number;
        const bbox = [lon - 0.006, lat - 0.004, lon + 0.006, lat + 0.004].join(",");
        return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
          bbox
        )}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
      })()
    : "";

  return (
    <section id="location" className="py-16 border-b border-border bg-surface/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-7">
          <div>
            <span className="text-[11px] font-mono uppercase text-accent font-bold">
              Τοποθεσία
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight mt-1">
              Βρείτε μας
            </h2>
            <p className="text-xs text-secondary mt-1.5 max-w-xl">
              Ελάτε να δείτε από κοντά τους χώρους. Η εγγραφή και η παραλαβή
              κάρτας μέλους γίνονται στη ρεσεψιόν.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              openDirections(config.latitude, config.longitude, addressLine)
            }
            disabled={!addressLine}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-btn hover:bg-btn-hover text-btn-ink font-bold text-xs self-start sm:self-auto disabled:opacity-50"
          >
            <Navigation className="w-3.5 h-3.5" />
            Πώς θα έρθω
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 space-y-3">
            <div className="p-4 rounded-xl bg-background border border-border flex items-start gap-3">
              <MapPin className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-bold text-primary">Διεύθυνση</div>
                <div className="text-xs text-secondary mt-0.5">
                  {addressLine || "Η διεύθυνση δεν έχει οριστεί."}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background border border-border flex items-start gap-3">
              <Clock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-bold text-primary">Ωράριο</div>
                <div className="text-xs text-secondary mt-0.5">
                  Δευτέρα - Παρασκευή: {config.workingHours.weekdays}
                </div>
                <div className="text-xs text-secondary">
                  Σάββατο: {config.workingHours.saturday} · Κυριακή:{" "}
                  {config.workingHours.sunday}
                </div>
              </div>
            </div>

            {config.phone && (
              <a
                href={phoneHref}
                className="p-4 rounded-xl bg-background border border-border flex items-start gap-3 hover:border-border-light transition-colors"
              >
                <Phone className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div>
                  <div className="text-[11px] font-bold text-primary">Τηλέφωνο</div>
                  <div className="text-xs text-secondary mt-0.5">{config.phone}</div>
                </div>
              </a>
            )}

            <a
              href={`mailto:${config.email}`}
              className="p-4 rounded-xl bg-background border border-border flex items-start gap-3 hover:border-border-light transition-colors"
            >
              <Mail className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-bold text-primary">Email</div>
                <div className="text-xs text-secondary mt-0.5">{config.email}</div>
              </div>
            </a>
          </div>

          <div className="lg:col-span-7">
            <div className="relative h-80 sm:h-[420px] rounded-xl overflow-hidden border border-border bg-surface-elevated">
              {hasCoordinates ? (
                <iframe
                  title={`Χάρτης ${config.gymName} — ${addressLine}`}
                  src={embedUrl}
                  className="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              ) : (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
                  style={{
                    backgroundImage:
                      "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
                    backgroundSize: "34px 34px",
                  }}
                >
                  <div className="absolute inset-0 bg-background/55" />
                  <div className="relative z-10 flex flex-col items-center gap-3 max-w-sm">
                    <div className="w-12 h-12 rounded-full bg-accent text-accent-ink flex items-center justify-center shadow-lg">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-primary">
                        Η τοποθεσία δεν έχει οριστεί ακόμη
                      </div>
                      <div className="text-[11px] text-secondary mt-1">
                        Επικοινώνησε με τη γραμματεία για οδηγίες πρόσβασης.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] text-tertiary mt-2">
              Ο χάρτης φορτώνεται από την OpenStreetMap. Το κουμπί «Πώς θα έρθω»
              ανοίγει Google Maps ή Apple Maps ανάλογα με τη συσκευή.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
