import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  try {
    if (typeof stored === "string" && stored.startsWith("scrypt:")) {
      const parts = stored.split(":");
      if (parts.length !== 3) return false;
      const saltHex = parts[1];
      const hashHex = parts[2];
      const derived = scryptSync(pin, Buffer.from(saltHex, "hex"), 32);
      const expected = Buffer.from(hashHex, "hex");
      if (expected.length !== derived.length) return false;
      return timingSafeEqual(derived, expected);
    }
    return pin === stored;
  } catch {
    return false;
  }
}
