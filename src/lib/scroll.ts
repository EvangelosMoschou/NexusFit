// In-page navigation that leaves the URL clean.
//
// Hash links push a history entry for every section, which makes the browser
// Back button walk through anchors instead of leaving the page (or closing the
// member area). These helpers scroll without touching the URL and strip a hash
// left over from an older link.

export function clearUrlHash(): void {
  if (typeof window === "undefined") return;
  if (!window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search
  );
}

export function scrollToSection(id: string, offset = 72): void {
  if (typeof document === "undefined") return;
  const element = document.getElementById(id);
  if (!element) return;

  const top = element.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
  clearUrlHash();
}
