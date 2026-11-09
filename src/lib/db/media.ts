import { randomUUID } from "node:crypto";
import { getDatabase } from "./connection";
import { DEFAULT_TENANT_ID } from "./tenant";
import type { DbMedia, MediaInput, MediaWithData } from "./types";

// Gallery media (admin uploads). The bytes live in SQLite so they are covered
// by the database backups and by the per-tenant isolation.

const MAX_MEDIA_ITEMS = 60;

// Gallery media (admin uploads). The bytes live in SQLite so they are covered
// by the database backups and by the per-tenant isolation.
export function listMediaAdmin(tenantId: string = DEFAULT_TENANT_ID): DbMedia[] {
  try {
    const db = getDatabase(tenantId);
    return db
      .prepare(
        "SELECT id, filename, mime, size, alt, created_at FROM media ORDER BY created_at DESC"
      )
      .all() as unknown as DbMedia[];
  } catch (err) {
    console.error("[sqliteDb] listMediaAdmin failed:", err);
    return [];
  }
}

export function getMediaWithData(
  id: string,
  tenantId: string = DEFAULT_TENANT_ID
): MediaWithData | null {
  try {
    const db = getDatabase(tenantId);
    const row = db
      .prepare("SELECT id, filename, mime, size, alt, created_at, data FROM media WHERE id = ?")
      .get(id) as (DbMedia & { data: Uint8Array | ArrayBuffer }) | undefined;

    if (!row) return null;
    const data = row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data);
    return { ...row, data };
  } catch (err) {
    console.error("[sqliteDb] getMediaWithData failed:", err);
    return null;
  }
}

export function saveMediaToDb(
  input: MediaInput,
  tenantId: string = DEFAULT_TENANT_ID
): DbMedia | null {
  try {
    const db = getDatabase(tenantId);
    const count = (db.prepare("SELECT COUNT(*) as c FROM media").get() as { c: number }).c;
    if (count >= MAX_MEDIA_ITEMS) return null;

    const id = `media-${randomUUID()}`;
    const createdAt = new Date().toISOString();
    db.prepare(
      "INSERT INTO media (id, filename, mime, size, alt, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, input.filename, input.mime, input.size, input.alt, input.data, createdAt);

    return {
      id,
      filename: input.filename,
      mime: input.mime,
      size: input.size,
      alt: input.alt,
      created_at: createdAt,
    };
  } catch (err) {
    console.error("[sqliteDb] saveMediaToDb failed:", err);
    return null;
  }
}

export function deleteMediaAdmin(id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  try {
    const db = getDatabase(tenantId);
    const result = db.prepare("DELETE FROM media WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  } catch (err) {
    console.error("[sqliteDb] deleteMediaAdmin failed:", err);
    return false;
  }
}
