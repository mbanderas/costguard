import { describe, it, expect } from "vitest";
import { reconcileFly } from "../../src/providers/fly/reconcile.js";
import type { NormalizedFlyApp } from "../../src/providers/fly/reconcile.js";

// Offline fixture-backed reconcile: dedicated IPv4 addresses on non-critical /
// preview apps cost $2/mo each and are usually safe to release.

describe("reconcileFly — orphaned IPv4", () => {
  it("flags dedicated IPv4 on a non-critical app but not a critical one", () => {
    const apps: NormalizedFlyApp[] = [
      { name: "preview-pr-1", dedicatedIpv4Count: 1, critical: false },
      { name: "prod", dedicatedIpv4Count: 2, critical: true },
    ];
    const findings = reconcileFly({ apps, workspace: "acme" });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("fly/orphaned-ipv4");
    expect(f.provider).toBe("fly");
    expect(f.detail).toMatch(/preview-pr-1/);
    // 1 IPv4 * $2/mo
    expect(f.estMonthlyUsd).toBeCloseTo(2, 5);
    expect(f.autofixable).toBe(false);
  });

  it("does not flag a non-critical app with no dedicated IPv4", () => {
    const apps: NormalizedFlyApp[] = [
      { name: "preview-pr-2", dedicatedIpv4Count: 0, critical: false },
    ];
    expect(reconcileFly({ apps, workspace: "acme" })).toHaveLength(0);
  });
});
