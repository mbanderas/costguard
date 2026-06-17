import { describe, it, expect } from "vitest";
import { loadUpstashPricing } from "../../src/providers/upstash/pricing.js";

// Offline: validates the sourced knowledge/upstash.json fact file.

describe("loadUpstashPricing — sourced facts", () => {
  it("loads pay-as-you-go rates", () => {
    const p = loadUpstashPricing();
    expect(p.provider).toBe("upstash");
    expect(p.paygPer100kCommandsUsd).toBeCloseTo(0.2, 8);
    expect(p.paygStorageUsdPerGbMonth).toBeCloseTo(0.25, 8);
    expect(p.paygFreeStorageGb).toBe(1);
  });

  it("loads the fixed-plan ladder", () => {
    const p = loadUpstashPricing();
    const names = p.fixedPlans.map((x) => x.name);
    expect(names).toContain("1gb");
    const oneGb = p.fixedPlans.find((x) => x.name === "1gb");
    expect(oneGb?.monthlyUsd).toBe(20);
  });

  it("ships at least one https source URL", () => {
    const p = loadUpstashPricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) expect(s.url).toMatch(/^https:\/\//);
  });
});
