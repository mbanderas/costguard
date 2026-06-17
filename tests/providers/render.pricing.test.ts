import { describe, it, expect } from "vitest";
import { loadRenderPricing } from "../../src/providers/render/pricing.js";

// Offline: validates the sourced knowledge/render.json fact file.

describe("loadRenderPricing — sourced facts", () => {
  it("loads the compute plan ladder", () => {
    const p = loadRenderPricing();
    expect(p.provider).toBe("render");
    const standard = p.computePlans.find((x) => x.name === "standard");
    expect(standard?.monthlyUsd).toBe(25);
    const pro = p.computePlans.find((x) => x.name === "pro");
    expect(pro?.monthlyUsd).toBe(85);
    expect(p.bandwidthOverageUsdPerGb).toBeCloseTo(0.15, 8);
  });

  it("ships at least one https source URL", () => {
    const p = loadRenderPricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) expect(s.url).toMatch(/^https:\/\//);
  });
});
