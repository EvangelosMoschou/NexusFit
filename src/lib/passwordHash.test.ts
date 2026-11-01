import { describe, expect, it } from "vitest";
import { hashPin, hashPinSync, verifyPin, verifyPinSync } from "./passwordHash";

describe("password hashing", () => {
  it("hashes and verifies asynchronously", async () => {
    const stored = await hashPin("1234");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(await verifyPin("1234", stored)).toBe(true);
    expect(await verifyPin("0000", stored)).toBe(false);
  });

  it("keeps sync and async hashes compatible in both directions", async () => {
    const syncHash = hashPinSync("4321");
    expect(await verifyPin("4321", syncHash)).toBe(true);

    const asyncHash = await hashPin("4321");
    expect(verifyPinSync("4321", asyncHash)).toBe(true);
  });

  it("rejects malformed stored values", async () => {
    expect(await verifyPin("1234", "not-a-hash")).toBe(false);
    expect(await verifyPin("1234", "scrypt:only-two-parts")).toBe(false);
  });
});
