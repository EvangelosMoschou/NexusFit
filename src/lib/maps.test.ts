import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDirectionsUrl } from "./maps";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("directions URLs", () => {
  it("uses Apple Maps on iPhone/iPad", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      maxTouchPoints: 5,
    });
    const url = buildDirectionsUrl(40.6263, 22.9485);
    expect(url).toContain("maps.apple.com");
    expect(url).toContain("daddr=40.6263%2C22.9485");
    expect(url).toContain("dirflg=d");
  });

  it("uses Google Maps on Android/desktop", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      maxTouchPoints: 5,
    });
    const url = buildDirectionsUrl(40.6263, 22.9485);
    expect(url).toContain("google.com/maps/dir");
    expect(url).toContain("destination=40.6263%2C22.9485");
    expect(url).toContain("travelmode=driving");
  });

  it("falls back to the address when coordinates are missing", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      maxTouchPoints: 0,
    });
    const url = buildDirectionsUrl(undefined, undefined, "Λεωφόρος Νίκης 1, Θεσσαλονίκη");
    expect(url).toContain(
      encodeURIComponent("Λεωφόρος Νίκης 1, Θεσσαλονίκη")
    );
  });

  it("returns an empty string without a destination", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      maxTouchPoints: 0,
    });
    expect(buildDirectionsUrl()).toBe("");
  });
});
