import { describe, it, expect } from "vitest";
import { reconcileUpstash } from "../../src/providers/upstash/reconcile.js";
import type { NormalizedUpstashUsage } from "../../src/providers/upstash/reconcile.js";

// Offline fixture-backed reconcile: a high-command pay-as-you-go workload is
// often far costlier than a fixed plan with the same storage footprint.

describe("reconcileUpstash — payg vs fixed", () => {
  it("flags a high-command PAYG workload cheaper on a fixed plan", () => {
    const usage: NormalizedUpstashUsage = {
      plan: "payg",
      monthlyCommands: 200_000_000,
      storageGb: 0.5,
    };
    const findings = reconcileUpstash({ usage, workspace: "acme" });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("upstash/payg-vs-fixed");
    expect(f.provider).toBe("upstash");
    // payg = 2000*0.20 + max(0,0.5-1)*0.25 = 400; cheapest fixed >=0.5GB = 1gb $20
    // waste = 400 - 20 = 380
    expect(f.estMonthlyUsd).toBeCloseTo(380, 5);
    expect(f.severity).toBe("high");
    expect(f.autofixable).toBe(false);
  });

  it("does not flag a light PAYG workload (cheaper than any fixed plan)", () => {
    const usage: NormalizedUpstashUsage = {
      plan: "payg",
      monthlyCommands: 1_000_000,
      storageGb: 0.1,
    };
    expect(reconcileUpstash({ usage, workspace: "acme" })).toHaveLength(0);
  });

  it("does not flag a fixed-plan database", () => {
    const usage: NormalizedUpstashUsage = {
      plan: "fixed",
      monthlyCommands: 999_999_999,
      storageGb: 0.5,
    };
    expect(reconcileUpstash({ usage, workspace: "acme" })).toHaveLength(0);
  });
});
