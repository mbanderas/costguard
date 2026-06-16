import { describe, it, expect } from "vitest";
import { estimateOverageUsd } from "../../src/providers/github/pricing.js";

describe("estimateOverageUsd", () => {
  it("returns correct overage when minutes exceed included", () => {
    const result = estimateOverageUsd(3000, 2000, 0.008);
    expect(result).toBeCloseTo(8, 10);
  });

  it("returns 0 when minutes are within included budget", () => {
    const result = estimateOverageUsd(1000, 2000, 0.008);
    expect(result).toBe(0);
  });

  it("returns 0 when minutes exactly equal included", () => {
    const result = estimateOverageUsd(2000, 2000, 0.008);
    expect(result).toBe(0);
  });
});
