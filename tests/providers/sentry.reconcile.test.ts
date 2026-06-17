import { describe, it, expect } from "vitest";
import { reconcileSentry } from "../../src/providers/sentry/reconcile.js";
import type { NormalizedSentryUsage } from "../../src/providers/sentry/reconcile.js";

// Offline fixture-backed reconcile: error events beyond the plan quota are
// billed per event at the sourced PAYG rate (knowledge/sentry.json).

describe("reconcileSentry — error-event overage", () => {
  it("quantifies errors over the Team quota at the PAYG rate", () => {
    const usage: NormalizedSentryUsage = { plan: "team", monthlyErrorEvents: 200_000 };
    const findings = reconcileSentry({ usage, workspace: "acme" });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("sentry/error-overage");
    expect(f.provider).toBe("sentry");
    // overage = 200000 - 50000 = 150000; 150000 * 0.00036 = 54
    expect(f.estMonthlyUsd).toBeCloseTo(54, 5);
    expect(f.autofixable).toBe(false);
  });

  it("does not flag usage within the included quota", () => {
    const usage: NormalizedSentryUsage = { plan: "developer", monthlyErrorEvents: 4000 };
    expect(reconcileSentry({ usage, workspace: "acme" })).toHaveLength(0);
  });
});
