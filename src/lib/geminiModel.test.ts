import { describe, expect, it } from "vitest";
import { DEFAULT_GEMINI_MODEL, geminiEndpoint, resolveGeminiModel } from "./geminiModel";

describe("resolveGeminiModel", () => {
  it("uses the default when the variable is unset or blank", () => {
    expect(resolveGeminiModel(undefined)).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel("")).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel("   ")).toBe(DEFAULT_GEMINI_MODEL);
  });

  it("accepts a well-formed model id", () => {
    expect(resolveGeminiModel("gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(resolveGeminiModel("gemini-2.0-flash-lite")).toBe("gemini-2.0-flash-lite");
    expect(resolveGeminiModel("  gemini-2.5-flash  ")).toBe("gemini-2.5-flash");
  });

  it("falls back instead of letting a value escape the URL path", () => {
    // Each of these would change the request target if interpolated as-is.
    for (const hostile of [
      "../v1/models/other",
      "gemini-2.0-flash-lite?key=stolen",
      "gemini-2.0-flash-lite#fragment",
      "gemini 2.0",
      "gemini-2.0-flash-lite/../../admin",
      "-leading-hyphen",
      "a".repeat(65),
    ]) {
      expect(resolveGeminiModel(hostile)).toBe(DEFAULT_GEMINI_MODEL);
    }
  });

  it("reads GEMINI_MODEL from the environment by default", () => {
    const previous = process.env.GEMINI_MODEL;
    try {
      process.env.GEMINI_MODEL = "gemini-2.5-flash";
      expect(resolveGeminiModel()).toBe("gemini-2.5-flash");
      delete process.env.GEMINI_MODEL;
      expect(resolveGeminiModel()).toBe(DEFAULT_GEMINI_MODEL);
    } finally {
      if (previous === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = previous;
    }
  });
});

describe("geminiEndpoint", () => {
  it("builds the generateContent URL for the given model", () => {
    expect(geminiEndpoint("gemini-2.5-pro", "KEY")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=KEY"
    );
  });
});
