import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  clearConsent,
  hasConsent,
  hasValidConsent,
  readConsent,
  writeConsent,
} from "./consent";
import { installBrowserStorage } from "./testUtils/browserStorage";

let store: Map<string, string>;

beforeEach(() => {
  store = installBrowserStorage();
  store.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consent record", () => {
  it("returns null when nothing is stored", () => {
    expect(readConsent()).toBeNull();
    expect(hasValidConsent()).toBe(false);
  });

  it("writes and reads a versioned record with a timestamp", () => {
    const written = writeConsent("accepted");

    expect(written.choice).toBe("accepted");
    expect(written.version).toBe(CONSENT_VERSION);
    expect(written.ts).not.toBe("");

    const read = readConsent();
    expect(read?.choice).toBe("accepted");
    expect(read?.version).toBe(CONSENT_VERSION);
    expect(hasValidConsent()).toBe(true);
  });

  it("stores the record as JSON under the expected key", () => {
    writeConsent("essential_only");
    const raw = store.get(CONSENT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({ choice: "essential_only", version: CONSENT_VERSION });
  });

  it("treats a legacy bare-string value as invalid for the current version", () => {
    store.set(CONSENT_STORAGE_KEY, "accepted");

    const read = readConsent();
    expect(read?.choice).toBe("accepted");
    expect(read?.version).toBe(0);
    expect(hasValidConsent()).toBe(false);
  });

  it("ignores malformed or unknown values", () => {
    store.set(CONSENT_STORAGE_KEY, "not-json");
    expect(readConsent()).toBeNull();

    store.set(CONSENT_STORAGE_KEY, JSON.stringify({ choice: "maybe", version: 1 }));
    expect(readConsent()).toBeNull();
  });

  it("invalidates consent recorded under a different version", () => {
    store.set(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ choice: "accepted", ts: "2020-01-01T00:00:00.000Z", version: CONSENT_VERSION + 1 })
    );

    expect(hasValidConsent()).toBe(false);
  });

  it("grants optional-storage permission only for full acceptance", () => {
    expect(hasConsent()).toBe(false);

    writeConsent("essential_only");
    expect(hasConsent()).toBe(false);

    writeConsent("accepted");
    expect(hasConsent()).toBe(true);
  });

  it("clears the record so the banner can be shown again", () => {
    writeConsent("accepted");
    expect(hasConsent()).toBe(true);

    clearConsent();
    expect(readConsent()).toBeNull();
    expect(hasConsent()).toBe(false);
  });
});
