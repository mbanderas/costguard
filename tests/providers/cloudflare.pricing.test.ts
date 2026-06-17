import { describe, it, expect } from "vitest";
import { loadCloudflarePricing } from "../../src/providers/cloudflare/pricing.js";

// Offline: validates the sourced knowledge/cloudflare.json fact file.

describe("loadCloudflarePricing — sourced facts", () => {
  it("loads R2 storage and operation rates", () => {
    const p = loadCloudflarePricing();
    expect(p.provider).toBe("cloudflare");
    expect(p.r2.storageUsdPerGbMonth).toBeCloseTo(0.015, 8);
    expect(p.r2.freeStorageGb).toBe(10);
    expect(p.r2.classAUsdPerMillion).toBeCloseTo(4.5, 8);
    expect(p.r2.freeClassAOps).toBe(1_000_000);
    expect(p.r2.classBUsdPerMillion).toBeCloseTo(0.36, 8);
    expect(p.r2.freeClassBOps).toBe(10_000_000);
  });

  it("ships at least one https source URL", () => {
    const p = loadCloudflarePricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) expect(s.url).toMatch(/^https:\/\//);
  });
});
