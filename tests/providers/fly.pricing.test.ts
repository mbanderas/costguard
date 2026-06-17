import { describe, it, expect } from "vitest";
import { loadFlyPricing } from "../../src/providers/fly/pricing.js";

// Offline: validates the sourced knowledge/fly.json fact file.

describe("loadFlyPricing — sourced facts", () => {
  it("loads dedicated IPv4 and egress rates", () => {
    const p = loadFlyPricing();
    expect(p.provider).toBe("fly");
    expect(p.dedicatedIpv4UsdPerMonth).toBe(2);
    expect(p.outboundUsdPerGb).toBeCloseTo(0.02, 8);
  });

  it("ships at least one https source URL", () => {
    const p = loadFlyPricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) expect(s.url).toMatch(/^https:\/\//);
  });
});
