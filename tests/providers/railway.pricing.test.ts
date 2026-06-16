import { describe, it, expect } from "vitest";
import { idleServiceMonthlyCost } from "../../src/providers/railway/pricing.js";

describe("idleServiceMonthlyCost", () => {
  it("splits base evenly across service count", () => {
    expect(idleServiceMonthlyCost(5, 2)).toBe(2.5);
  });

  it("returns baseMonthly when serviceCount is 0", () => {
    expect(idleServiceMonthlyCost(5, 0)).toBe(5);
  });
});
