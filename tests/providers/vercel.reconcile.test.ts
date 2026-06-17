import { describe, it, expect } from "vitest";
import { reconcileVercel } from "../../src/providers/vercel/reconcile.js";
import type { NormalizedVercelUsage } from "../../src/providers/vercel/reconcile.js";

// Offline fixture-backed reconcile: idle paid deploying seats on Vercel Pro
// cost $20/mo each (1 seat is included). Numbers come from knowledge/vercel.json.

describe("reconcileVercel — idle deploying seats", () => {
  it("quantifies idle paid seats at $20/mo each", () => {
    const usage: NormalizedVercelUsage = {
      plan: "pro",
      paidDeployingSeats: 5,
      activeDeployingSeats: 2,
    };
    const findings = reconcileVercel({ usage, workspace: "acme" });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("vercel/idle-seats");
    // idle = paid(5) - max(active 2, included 1) = 3 seats; 3 * $20 = $60/mo
    expect(f.estMonthlyUsd).toBeCloseTo(60, 5);
    expect(f.severity).toBe("high");
    expect(f.provider).toBe("vercel");
    expect(f.autofixable).toBe(false);
  });

  it("does not flag when every paid seat is an active deployer", () => {
    const usage: NormalizedVercelUsage = {
      plan: "pro",
      paidDeployingSeats: 3,
      activeDeployingSeats: 3,
    };
    expect(reconcileVercel({ usage, workspace: "acme" })).toHaveLength(0);
  });

  it("does not flag a single included seat", () => {
    const usage: NormalizedVercelUsage = {
      plan: "pro",
      paidDeployingSeats: 1,
      activeDeployingSeats: 0,
    };
    expect(reconcileVercel({ usage, workspace: "acme" })).toHaveLength(0);
  });
});
