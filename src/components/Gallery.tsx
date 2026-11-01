"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useEscapeKey } from "@/lib/useEscapeKey";

interface GalleryItem {
  id: string;
  alt: string;
  url: string;
  created_at: string;
}

export const Gallery: React.FC = () => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [active, setActive] = useState<GalleryItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/media")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.media)) {
          setItems(data.media);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEscapeKey(Boolean(active), () => setActive(null));

  if (items.length === 0) return null;

  return (
    <section id="gallery" className="py-16 border-b border-border bg-surface/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-8">
          <span className="text-[11px] font-mono text-accent uppercase font-bold">
            Ο Χώρος
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight mt-1">
            Φωτογραφίες Γυμναστηρίου
          </h2>
          <p className="text-secondary text-xs sm:text-sm mt-1">
            Μια ματιά στις αίθουσες, τον εξοπλισμό και τους εξωτερικούς χώρους.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item)}
              className="group relative overflow-hidden rounded-xl border border-border bg-background"
              aria-label={item.alt || "Άνοιγμα φωτογραφίας"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.alt || "Φωτογραφία γυμναστηρίου"}
                loading="lazy"
                className="w-full aspect-[4/3] object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={active.alt || "Φωτογραφία γυμναστηρίου"}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85"
        >
          <button
            type="button"
            onClick={() => setActive(null)}
            aria-label="Κλείσιμο φωτογραφίας"
            className="absolute inset-0 cursor-default"
          />

          <button
            type="button"
            onClick={() => setActive(null)}
            aria-label="Κλείσιμο"
            className="absolute top-4 right-4 z-20 p-2 rounded-lg bg-surface border border-border text-primary hover:bg-surface-elevated transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <figure className="relative z-10 max-w-4xl w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={active.alt || "Φωτογραφία γυμναστηρίου"}
              className="w-full max-h-[85vh] object-contain rounded-xl"
            />
            {active.alt && (
              <figcaption className="text-center text-xs text-secondary mt-3">
                {active.alt}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </section>
  );
};
