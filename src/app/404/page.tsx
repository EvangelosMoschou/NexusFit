import { notFound } from "next/navigation";

// Preview entry for the custom not-found page: visiting /404 renders the same
// boundary a visitor sees for an unknown URL.
export default function NotFoundPreviewPage(): never {
  notFound();
}
