import { describe, it, expect } from "vitest";
import { reconcileDatadog } from "../../src/providers/datadog/reconcile.js";
import type { NormalizedDatadogUsage } from "../../src/providers/datadog/reconcile.js";

// Offline fixture-backed reconcile: APM enabled on more hosts than needed bills
// $31/host/mo (Pro) for low-value coverage.

describe("reconcileDatadog — excess APM hosts", () => {
  it("quantifies APM hosts above the needed count at the Pro rate", () => {
    const usage: NormalizedDatadogUsage = {
      plan: "pro",
      apmHostsActive: 50,
      apmHostsNeeded: 10,
    };
    const findings = reconcileDatadog({ usage, workspace: "acme" });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("datadog/excess-apm-hosts");
    expect(f.provider).toBe("datadog");
    // (50 - 10) * $31 = 1240
    expect(f.estMonthlyUsd).toBeCloseTo(1240, 5);
    expect(f.severity).toBe("high");
    expect(f.autofixable).toBe(false);
  });

  it("uses the enterprise rate when declared", () => {
    const usage: NormalizedDatadogUsage = {
      plan: "enterprise",
      apmHostsActive: 20,
      apmHostsNeeded: 15,
    };
    const f = reconcileDatadog({ usage, workspace: "acme" })[0]!;
    // (20 - 15) * $40 = 200
    expect(f.estMonthlyUsd).toBeCloseTo(200, 5);
  });

  it("does not flag when APM hosts match the needed count", () => {
    const usage: NormalizedDatadogUsage = {
      plan: "pro",
      apmHostsActive: 10,
      apmHostsNeeded: 10,
    };
    expect(reconcileDatadog({ usage, workspace: "acme" })).toHaveLength(0);
  });
});
