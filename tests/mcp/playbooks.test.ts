import { describe, it, expect } from "vitest";
import { allPlaybooks, playbookFor } from "../../src/mcp/live/playbooks/index.js";
import { parseSpecSchema, type LiveCheckPlaybook } from "../../src/mcp/schemas.js";
import { planLiveChecksHandler } from "../../src/mcp/tools/planLiveChecks.js";
import { ingestLiveReadingHandler } from "../../src/mcp/tools/ingestLiveReading.js";
import type { Finding } from "../../src/types.js";
import { readOnlyViolations } from "./readOnlyOracle.js";

describe("provider playbooks", () => {
  it("registers a non-empty first-cut set", () => {
    expect(allPlaybooks().length).toBeGreaterThan(0);
  });

  it("every snippet passes the read-only invariant oracle (load-bearing)", () => {
    for (const [provider, pb] of allPlaybooks()) {
      expect(readOnlyViolations(pb.readOnlySnippet), `${provider} snippet must be read-only`).toEqual([]);
    }
  });

  it("every parseSpec uses only currency|number|label fields and a valid monthlyUsdField", () => {
    for (const [provider, pb] of allPlaybooks()) {
      // schema enforces the closed kind union (rejects token/cookie kinds)
      expect(() => parseSpecSchema.parse(pb.parseSpec), `${provider} parseSpec`).not.toThrow();
      const names = pb.parseSpec.fields.map((f) => f.name);
      expect(names).toContain(pb.parseSpec.monthlyUsdField);
    }
  });

  it("lookup returns undefined (not throw) for an unknown provider", () => {
    expect(playbookFor("no-such-provider")).toBeUndefined();
  });
});

// End-to-end: a browser-fallback provider (no token) WITH a playbook now emits a
// snippet via plan_live_checks, and that snippet passes the oracle.
describe("plan_live_checks emits a read-only snippet for a playbook provider", () => {
  it("vercel without a token + consent -> snippet present and read-only", () => {
    const saved = { t: process.env["VERCEL_TOKEN"], a: process.env["VERCEL_API_TOKEN"] };
    delete process.env["VERCEL_TOKEN"];
    delete process.env["VERCEL_API_TOKEN"];
    try {
      const res = planLiveChecksHandler({ provider: "vercel", confirmLive: true });
      const pb = res.structuredContent as LiveCheckPlaybook;
      expect(pb.apiFirst).toBe(false);
      expect(pb.readOnlySnippet).toBeDefined();
      expect(readOnlyViolations(pb.readOnlySnippet ?? "")).toEqual([]);
      expect(pb.billingUrl).toContain("vercel.com");
    } finally {
      if (saved.t !== undefined) process.env["VERCEL_TOKEN"] = saved.t;
      if (saved.a !== undefined) process.env["VERCEL_API_TOKEN"] = saved.a;
    }
  });

  it("ingest_live_reading reads the value under the playbook's monthlyUsdField", () => {
    const res = ingestLiveReadingHandler({
      provider: "vercel",
      reading: { planId: "p", values: { monthlyTotal: "$88.00" } },
    });
    const f = (res.structuredContent as { finding: Finding }).finding;
    expect(f.kind).toBe("cost");
    expect(f.estMonthlyUsd).toBeCloseTo(88, 5);
  });
});
