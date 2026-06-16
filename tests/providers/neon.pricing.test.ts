import { describe, it, expect } from "vitest";
import { computeOverageCost } from "../../src/providers/neon/pricing.js";

describe("computeOverageCost", () => {
  it("returns overage cost when usage exceeds free tier", () => {
    // 900000 seconds = 250 hours; free = 191.9; overage = 58.1; rate = 0.16
    expect(computeOverageCost(250, 191.9, 0.16)).toBeCloseTo(9.296, 2);
  });

  it("returns 0 when usage is within free tier", () => {
    expect(computeOverageCost(100, 191.9, 0.16)).toBe(0);
  });

  it("returns 0 when usage exactly equals free tier", () => {
    expect(computeOverageCost(191.9, 191.9, 0.16)).toBe(0);
  });
});
