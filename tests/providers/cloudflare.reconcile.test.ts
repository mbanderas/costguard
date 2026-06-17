import { describe, it, expect } from "vitest";
import { reconcileCloudflare } from "../../src/providers/cloudflare/reconcile.js";
import type { NormalizedR2Usage } from "../../src/providers/cloudflare/reconcile.js";

// Offline fixture-backed reconcile: when R2 operation charges dwarf storage
// cost, it signals a small-object anti-pattern that batching can cut.

describe("reconcileCloudflare — R2 op-heavy", () => {
  it("flags R2 usage where operation cost dominates storage", () => {
    const usage: NormalizedR2Usage = {
      storageGb: 20,
      classAOps: 50_000_000,
      classBOps: 100_000_000,
    };
    const findings = reconcileCloudflare({ usage, workspace: "acme" });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("cloudflare/r2-op-heavy");
    expect(f.provider).toBe("cloudflare");
    // classA = (50M-1M)/1e6*4.50 = 220.5; classB = (100M-10M)/1e6*0.36 = 32.4
    // opsCost = 252.9 (storage = (20-10)*0.015 = 0.15)
    expect(f.estMonthlyUsd).toBeCloseTo(252.9, 4);
    expect(f.severity).toBe("high");
    expect(f.autofixable).toBe(false);
  });

  it("does not flag storage-dominant R2 usage within op free tiers", () => {
    const usage: NormalizedR2Usage = {
      storageGb: 100,
      classAOps: 500_000,
      classBOps: 1_000_000,
    };
    expect(reconcileCloudflare({ usage, workspace: "acme" })).toHaveLength(0);
  });
});
