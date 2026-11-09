import { describe, expect, it } from "vitest";
import {
  isPremiumSubscriptionActive,
  isSubscriptionActive,
} from "./subscription";

const future = "2999-12-31";
const past = "2000-01-01";

describe("subscription gating", () => {
  it("allows an active subscription with a future expiry", () => {
    expect(isSubscriptionActive("active", future)).toBe(true);
  });

  it("rejects an expired status even if the date is in the future", () => {
    expect(isSubscriptionActive("expired", future)).toBe(false);
  });

  it("rejects an active status whose expiry date has passed", () => {
    expect(isSubscriptionActive("active", past)).toBe(false);
  });

  it("treats a missing expiry as open-ended", () => {
    expect(isSubscriptionActive("active", "")).toBe(true);
  });

  it("requires both an active subscription and the premium tier", () => {
    expect(isPremiumSubscriptionActive("active", future, 1)).toBe(true);
    expect(isPremiumSubscriptionActive("active", future, 0)).toBe(false);
    expect(isPremiumSubscriptionActive("expired", future, 1)).toBe(false);
    expect(isPremiumSubscriptionActive("active", past, 1)).toBe(false);
  });

  // The signature accepts `number | boolean`, so a caller that already mapped
  // the SQLite flag to a boolean must not be silently downgraded to non-premium.
  it("accepts the boolean form of the premium flag", () => {
    expect(isPremiumSubscriptionActive("active", future, true)).toBe(true);
    expect(isPremiumSubscriptionActive("active", future, false)).toBe(false);
  });
});
