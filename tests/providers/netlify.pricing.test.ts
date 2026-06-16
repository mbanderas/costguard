import { describe, it, expect } from "vitest";
import { buildMinuteOverageCost, bandwidthOverageCost } from "../../src/providers/netlify/pricing.js";

describe("buildMinuteOverageCost", () => {
  it("returns correct overage cost when used exceeds free", () => {
    expect(buildMinuteOverageCost(400, 300, 0.007)).toBeCloseTo(0.70, 10);
  });

  it("returns 0 when used is within free tier", () => {
    expect(buildMinuteOverageCost(200, 300, 0.007)).toBe(0);
  });

  it("returns 0 when used equals free tier", () => {
    expect(buildMinuteOverageCost(300, 300, 0.007)).toBe(0);
  });
});

describe("bandwidthOverageCost", () => {
  it("returns correct overage cost when used exceeds free", () => {
    expect(bandwidthOverageCost(150, 100, 0.20)).toBe(10);
  });

  it("returns 0 when used is within free tier", () => {
    expect(bandwidthOverageCost(50, 100, 0.20)).toBe(0);
  });

  it("returns 0 when used equals free tier", () => {
    expect(bandwidthOverageCost(100, 100, 0.20)).toBe(0);
  });
});
