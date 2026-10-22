// Consent state for the cookie banner.
//
// We store a versioned record (not a bare string) so that a consent choice can
// be audited: it carries when it was given and which policy version it covers.
// Bumping CONSENT_VERSION invalidates older consents and re-prompts the visitor.
export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = "nexusfit_cookie_consent";

export type ConsentChoice = "accepted" | "essential_only";

export interface ConsentRecord {
  choice: ConsentChoice;
  ts: string;
  version: number;
}

function isChoice(value: unknown): value is ConsentChoice {
  return value === "accepted" || value === "essential_only";
}

// Reads the stored consent. Legacy bare-string values (written before consent
// was versioned) are surfaced as version 0, so they are treated as invalid for
// the current policy version and the visitor is re-prompted once.
export function readConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;

    if (isChoice(raw)) {
      return { choice: raw, ts: "", version: 0 };
    }

    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed && isChoice(parsed.choice)) {
      return {
        choice: parsed.choice,
        ts: typeof parsed.ts === "string" ? parsed.ts : "",
        version: typeof parsed.version === "number" ? parsed.version : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): ConsentRecord {
  const record: ConsentRecord = {
    choice,
    ts: new Date().toISOString(),
    version: CONSENT_VERSION,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    } catch {}
  }

  return record;
}

// Consent counts as valid only while it matches the current policy version.
export function hasValidConsent(): boolean {
  const record = readConsent();
  return record !== null && record.version === CONSENT_VERSION;
}

// Non-essential storage (campaign parameters, optional local logs) may only be
// written when the visitor actively accepted all cookies. "essential_only"
// grants no permission for optional storage.
export function hasConsent(): boolean {
  return readConsent()?.choice === "accepted";
}

// Lets the visitor withdraw/change their choice: clearing the record makes the
// banner appear again on the next load.
export function clearConsent(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {}
}
