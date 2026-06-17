import { describe, it, expect } from "vitest";
import { loadSentryPricing } from "../../src/providers/sentry/pricing.js";

// Offline: validates the sourced knowledge/sentry.json fact file. Each number
// has a source URL in the JSON (Sentry pricing + plan breakdown docs).

describe("loadSentryPricing — sourced facts", () => {
  it("loads plan error quotas", () => {
    const p = loadSentryPricing();
    expect(p.provider).toBe("sentry");
    expect(p.plans.developer.includedErrors).toBe(5000);
    expect(p.plans.team.includedErrors).toBe(50000);
    expect(p.plans.team.monthlyUsd).toBe(26);
  });

  it("exposes the per-error PAYG overage rate", () => {
    const p = loadSentryPricing();
    expect(p.errorOverageUsdPerEvent).toBeCloseTo(0.00036, 8);
  });

  it("ships at least one https source URL", () => {
    const p = loadSentryPricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) expect(s.url).toMatch(/^https:\/\//);
  });
});
