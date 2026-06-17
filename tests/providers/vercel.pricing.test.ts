import { describe, it, expect } from "vitest";
import { loadVercelPricing } from "../../src/providers/vercel/pricing.js";

// Offline: validates the sourced knowledge/vercel.json fact file loads and
// exposes the numbers the reconcile relies on. Each number has a source URL
// in the JSON (Vercel Pro/Hobby plan + pricing docs).

describe("loadVercelPricing — sourced facts", () => {
  it("loads and validates the Vercel Pro seat economics", () => {
    const p = loadVercelPricing();
    expect(p.provider).toBe("vercel");
    expect(p.plans.pro.platformFeeUsd).toBe(20);
    expect(p.plans.pro.includedDeployingSeats).toBe(1);
    expect(p.plans.pro.additionalSeatUsd).toBe(20);
    expect(p.plans.pro.includedFastDataTransferGb).toBe(1024);
    expect(p.plans.pro.includedEdgeRequests).toBe(10_000_000);
  });

  it("exposes the sourced build CPU-minute rate and Hobby caps", () => {
    const p = loadVercelPricing();
    expect(p.buildCpuMinuteUsd).toBe(0.0035);
    expect(p.plans.hobby.includedCpuHours).toBe(4);
    expect(p.plans.hobby.includedFunctionInvocations).toBe(1_000_000);
  });

  it("ships at least one source URL", () => {
    const p = loadVercelPricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) {
      expect(s.url).toMatch(/^https:\/\//);
    }
  });
});
