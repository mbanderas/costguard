import { describe, it, expect } from "vitest";
import { reconcileAtlas } from "../../src/providers/atlas/reconcile.js";
import type { NormalizedAtlasCluster } from "../../src/providers/atlas/reconcile.js";

// Offline fixture-backed reconcile: a dev/staging cluster on a dedicated tier
// holding little data can drop to a much cheaper shared tier.

describe("reconcileAtlas — oversized non-prod cluster", () => {
  it("flags a staging M10 holding tiny data, recommending a cheaper paid tier", () => {
    const cluster: NormalizedAtlasCluster = {
      name: "acme-staging",
      tier: "M10",
      env: "staging",
      dataSizeGb: 0.3,
    };
    const findings = reconcileAtlas({ clusters: [cluster], workspace: "acme" });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("atlas/oversized-cluster");
    expect(f.provider).toBe("atlas");
    // M10 $57.60 -> cheapest paid fitting 0.3GB = M2 $9; waste = 48.60
    expect(f.estMonthlyUsd).toBeCloseTo(48.6, 5);
    expect(f.severity).toBe("high");
    expect(f.autofixable).toBe(false);
  });

  it("does not flag a production cluster (downsizing needs perf headroom)", () => {
    const cluster: NormalizedAtlasCluster = {
      name: "acme-prod",
      tier: "M10",
      env: "prod",
      dataSizeGb: 0.3,
    };
    expect(reconcileAtlas({ clusters: [cluster], workspace: "acme" })).toHaveLength(0);
  });

  it("does not flag a shared-tier dev cluster (already small)", () => {
    const cluster: NormalizedAtlasCluster = {
      name: "acme-dev",
      tier: "M2",
      env: "dev",
      dataSizeGb: 0.3,
    };
    expect(reconcileAtlas({ clusters: [cluster], workspace: "acme" })).toHaveLength(0);
  });
});
