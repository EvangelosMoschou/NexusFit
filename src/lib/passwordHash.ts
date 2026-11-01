import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 32;
const HASH_PREFIX = "scrypt";

function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LENGTH, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

// Request-path hashing is async so a login does not block the event loop while
// scrypt runs. The sync variants below exist only for one-time seeding and the
// legacy-PIN migration, which run before a request is served.
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await deriveKey(pin, salt);
  return `${HASH_PREFIX}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  try {
    if (typeof stored === "string" && stored.startsWith(`${HASH_PREFIX}:`)) {
      const parts = stored.split(":");
      if (parts.length !== 3) return false;

      const salt = Buffer.from(parts[1], "hex");
      const expected = Buffer.from(parts[2], "hex");
      const derived = await deriveKey(pin, salt);

      if (expected.length !== derived.length) return false;
      return timingSafeEqual(derived, expected);
    }
    return pin === stored;
  } catch {
    return false;
  }
}

export function hashPinSync(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEY_LENGTH);
  return `${HASH_PREFIX}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPinSync(pin: string, stored: string): boolean {
  try {
    if (typeof stored === "string" && stored.startsWith(`${HASH_PREFIX}:`)) {
      const parts = stored.split(":");
      if (parts.length !== 3) return false;

      const salt = Buffer.from(parts[1], "hex");
      const expected = Buffer.from(parts[2], "hex");
      const derived = scryptSync(pin, salt, KEY_LENGTH);

      if (expected.length !== derived.length) return false;
      return timingSafeEqual(derived, expected);
    }
    return pin === stored;
  } catch {
    return false;
  }
}
