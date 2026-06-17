import { describe, it, expect } from "vitest";
import { reconcileRender } from "../../src/providers/render/reconcile.js";
import type { NormalizedRenderService } from "../../src/providers/render/reconcile.js";

// Offline fixture-backed reconcile: a non-prod service on an oversized always-on
// plan can drop to Standard (1 vCPU / 2 GB) for most non-prod workloads.

describe("reconcileRender — oversized non-prod instance", () => {
  it("flags a staging Pro service, recommending Standard", () => {
    const svc: NormalizedRenderService = { name: "api-staging", plan: "pro", env: "staging" };
    const findings = reconcileRender({ services: [svc], workspace: "acme" });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("render/oversized-instance");
    expect(f.provider).toBe("render");
    // pro $85 -> standard $25; waste 60
    expect(f.estMonthlyUsd).toBeCloseTo(60, 5);
    expect(f.severity).toBe("high");
    expect(f.autofixable).toBe(false);
  });

  it("does not flag a production service", () => {
    const svc: NormalizedRenderService = { name: "api-prod", plan: "pro", env: "prod" };
    expect(reconcileRender({ services: [svc], workspace: "acme" })).toHaveLength(0);
  });

  it("does not flag a non-prod service already at/below Standard", () => {
    const svc: NormalizedRenderService = { name: "api-dev", plan: "starter", env: "dev" };
    expect(reconcileRender({ services: [svc], workspace: "acme" })).toHaveLength(0);
  });
});
