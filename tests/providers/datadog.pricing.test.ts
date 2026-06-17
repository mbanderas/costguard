import { describe, it, expect } from "vitest";
import { loadDatadogPricing } from "../../src/providers/datadog/pricing.js";

// Offline: validates the sourced knowledge/datadog.json fact file.

describe("loadDatadogPricing — sourced facts", () => {
  it("loads per-host APM and infra rates", () => {
    const p = loadDatadogPricing();
    expect(p.provider).toBe("datadog");
    expect(p.infraHostMonthlyUsd).toBe(15);
    expect(p.apmHostMonthlyUsd.pro).toBe(31);
    expect(p.apmHostMonthlyUsd.enterprise).toBe(40);
  });

  it("ships at least one https source URL", () => {
    const p = loadDatadogPricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) expect(s.url).toMatch(/^https:\/\//);
  });
});
