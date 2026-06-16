import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config.js";
import {
  computeTierRank,
  monthlyUsdForTier,
  overProvisionedComputeDelta,
} from "../../src/providers/supabase/pricing.js";

const pricing = DEFAULT_CONFIG.defaults.supabaseComputePricingMonthly;

describe("computeTierRank", () => {
  it("returns lower rank for micro than small", () => {
    const microRank = computeTierRank("micro", pricing);
    const smallRank = computeTierRank("small", pricing);
    expect(microRank).toBeGreaterThanOrEqual(0);
    expect(smallRank).toBeGreaterThan(microRank);
  });

  it("returns -1 for unknown tier", () => {
    expect(computeTierRank("unknown-tier", pricing)).toBe(-1);
  });
});

describe("monthlyUsdForTier", () => {
  it("returns 25 for small tier", () => {
    expect(monthlyUsdForTier("small", pricing)).toBe(25);
  });

  it("returns 10 for micro tier", () => {
    expect(monthlyUsdForTier("micro", pricing)).toBe(10);
  });

  it("returns 0 for unknown tier", () => {
    expect(monthlyUsdForTier("nonexistent", pricing)).toBe(0);
  });
});

describe("overProvisionedComputeDelta", () => {
  it("returns 15 when live is small and declared is micro", () => {
    expect(overProvisionedComputeDelta("micro", "small", pricing)).toBe(15);
  });

  it("returns 0 when live is micro and declared is small (under-provisioned)", () => {
    expect(overProvisionedComputeDelta("small", "micro", pricing)).toBe(0);
  });

  it("returns 0 when declared and live are the same tier", () => {
    expect(overProvisionedComputeDelta("micro", "micro", pricing)).toBe(0);
  });

  it("returns correct delta for larger tiers", () => {
    // large=110, small=25, delta=85
    expect(overProvisionedComputeDelta("small", "large", pricing)).toBe(85);
  });
});
