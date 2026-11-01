import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db";
import { adminRoute } from "@/lib/api";

const MAX_BYTES = 4 * 1024 * 1024;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

// The declared Content-Type is client-controlled, so the stored type comes from
// the file signature instead.
function detectImageMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (
    startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4) &&
    (startsWith(bytes, [0x61, 0x76, 0x69, 0x66], 8) ||
      startsWith(bytes, [0x61, 0x76, 0x69, 0x73], 8))
  ) {
    return "image/avif";
  }
  return null;
}

export const GET = adminRoute(async (_req, tenantId) => {
  const media = await getRepository(tenantId).listMedia();
  return NextResponse.json({
    success: true,
    media: media.map((item) => ({ ...item, url: `/api/media/${item.id}` })),
  });
}, "Failed to fetch media");

export const POST = adminRoute(async (req: NextRequest, tenantId: string) => {
  const form = await req.formData();
  const file = form.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json(
      { success: false, error: "Επιλέξτε αρχείο εικόνας." },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ success: false, error: "Το αρχείο είναι κενό." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: "Η εικόνα είναι μεγαλύτερη από 4 MB." },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageMime(bytes);

  if (!mime) {
    return NextResponse.json(
      { success: false, error: "Επιτρέπονται μόνο JPG, PNG, WebP ή AVIF." },
      { status: 415 }
    );
  }

  const alt = String(form.get("alt") ?? "").trim().slice(0, 160);
  const filename = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "photo";

  const saved = await getRepository(tenantId).saveMedia({
    filename,
    mime,
    size: bytes.length,
    alt,
    data: bytes,
  });

  if (!saved) {
    return NextResponse.json(
      { success: false, error: "Έχει συμπληρωθεί το όριο φωτογραφιών." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { success: true, media: { ...saved, url: `/api/media/${saved.id}` } },
    { status: 201 }
  );
}, "Failed to upload media");

export const DELETE = adminRoute(async (req: NextRequest, tenantId: string) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing media ID" }, { status: 400 });
  }

  const deleted = await getRepository(tenantId).deleteMedia(id);
  return NextResponse.json({ success: deleted });
}, "Failed to delete media");
