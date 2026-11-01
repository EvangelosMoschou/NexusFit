function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export function buildDirectionsUrl(
  latitude?: number,
  longitude?: number,
  address?: string
): string {
  const hasCoordinates =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude);

  const destination = hasCoordinates
    ? `${latitude},${longitude}`
    : (address ?? "").trim();

  if (!destination) return "";

  if (isAppleMobile()) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(
      destination
    )}&dirflg=d`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination
  )}&travelmode=driving`;
}

export function openDirections(
  latitude?: number,
  longitude?: number,
  address?: string
): void {
  const url = buildDirectionsUrl(latitude, longitude, address);
  if (!url || typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}
