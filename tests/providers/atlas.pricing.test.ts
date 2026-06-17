import { describe, it, expect } from "vitest";
import { loadAtlasPricing } from "../../src/providers/atlas/pricing.js";

// Offline: validates the sourced knowledge/atlas.json fact file.

describe("loadAtlasPricing — sourced facts", () => {
  it("loads the cluster tier ladder", () => {
    const p = loadAtlasPricing();
    expect(p.provider).toBe("atlas");
    const m2 = p.tiers.find((t) => t.name === "M2");
    expect(m2?.monthlyUsd).toBe(9);
    expect(m2?.dedicated).toBe(false);
    const m10 = p.tiers.find((t) => t.name === "M10");
    expect(m10?.dedicated).toBe(true);
    expect(m10?.monthlyUsd).toBeCloseTo(57.6, 5);
  });

  it("ships at least one https source URL", () => {
    const p = loadAtlasPricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) expect(s.url).toMatch(/^https:\/\//);
  });
});
