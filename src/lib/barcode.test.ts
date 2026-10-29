import { describe, expect, it } from "vitest";
import { normalizeBarcodeValue } from "@/components/Barcode";

describe("barcode value normalisation", () => {
  it("uppercases a member code and keeps allowed punctuation", () => {
    expect(normalizeBarcodeValue("nx-8492")).toBe("NX-8492");
    expect(normalizeBarcodeValue(" NX 8492 ")).toBe("NX 8492");
  });

  it("drops characters Code 39 cannot encode", () => {
    expect(normalizeBarcodeValue("NX-84<92>")).toBe("NX-8492");
    expect(normalizeBarcodeValue("αβγ")).toBe("MEMBER");
  });
});
