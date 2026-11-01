"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";

interface MediaItem {
  id: string;
  filename: string;
  mime: string;
  size: number;
  alt: string;
  created_at: string;
  url: string;
}

// Phone photos are often several megabytes. Downscale them in the browser
// before upload so the database stays small; the server also rejects >4 MB.
async function compressImage(file: File): Promise<File> {
  if (file.size <= 1_200_000) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) return file;

    // JPEG has no transparency; paint a white background first.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.\w+$/, "")}.jpg`, {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const MediaTab: React.FC = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/media", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setMedia(Array.isArray(data.media) ? data.media : []);
      } else {
        setError("Δεν ήταν δυνατή η φόρτωση των φωτογραφιών.");
      }
    } catch {
      setError("Σφάλμα σύνδεσης με τον server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Επιλέξτε φωτογραφία.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const prepared = await compressImage(file);
      const form = new FormData();
      form.append("file", prepared);
      form.append("alt", alt);

      const res = await fetch("/api/admin/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Η μεταφόρτωση απέτυχε.");
      }

      setFile(null);
      setAlt("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η μεταφόρτωση απέτυχε.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Να διαγραφεί οριστικά αυτή η φωτογραφία;")) return;

    try {
      const res = await fetch(`/api/admin/media?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Η διαγραφή απέτυχε.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η διαγραφή απέτυχε.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-primary flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-accent" />
          Φωτογραφίες Γυμναστηρίου
        </h2>
        <p className="text-xs text-secondary mt-1">
          Οι φωτογραφίες εμφανίζονται στην ενότητα «Φωτογραφίες» της αρχικής σελίδας.
        </p>
      </div>

      <form onSubmit={handleUpload} className="p-5 rounded-xl bg-surface border border-border space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label htmlFor="media-file" className="block text-[11px] text-secondary mb-1">
              Αρχείο εικόνας
            </label>
            <input
              id="media-file"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs file:mr-3 file:px-2.5 file:py-1 file:rounded file:border-0 file:bg-surface-elevated file:text-primary file:text-[11px] file:font-semibold"
            />
          </div>

          <div>
            <label htmlFor="media-alt" className="block text-[11px] text-secondary mb-1">
              Περιγραφή (alt)
            </label>
            <input
              id="media-alt"
              type="text"
              value={alt}
              maxLength={160}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="π.χ. Η αίθουσα γιόγκα"
              className="w-full px-3 py-2 rounded bg-background border border-border text-primary text-xs outline-none focus:border-border-light"
            />
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] text-tertiary">
            JPG, PNG, WebP ή AVIF, έως 4 MB. Οι μεγάλες εικόνες συμπιέζονται αυτόματα.
          </p>
          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 rounded bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-ink font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? "Μεταφόρτωση..." : "Μεταφόρτωση"}</span>
          </button>
        </div>
      </form>

      {loading ? (
        <div className="p-6 text-center text-xs text-secondary">Φόρτωση φωτογραφιών...</div>
      ) : media.length === 0 ? (
        <div className="p-6 rounded-xl bg-surface border border-border text-center text-xs text-secondary">
          Δεν υπάρχουν φωτογραφίες ακόμη.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {media.map((item) => (
            <div key={item.id} className="rounded-xl overflow-hidden bg-surface border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.alt || item.filename}
                className="w-full aspect-[4/3] object-cover"
                loading="lazy"
              />
              <div className="p-3 space-y-1">
                <div className="text-[11px] font-semibold text-primary truncate">
                  {item.alt || item.filename}
                </div>
                <div className="text-[10px] text-tertiary font-mono">
                  {formatSize(item.size)} • {new Date(item.created_at).toLocaleDateString("el-GR")}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="mt-1 px-2 py-1 rounded bg-surface-elevated hover:bg-border text-red-400 text-[10px] font-semibold border border-border flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Διαγραφή
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
