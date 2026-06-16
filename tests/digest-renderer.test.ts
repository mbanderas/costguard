import { describe, it, expect } from "vitest";
import type { Finding } from "../src/types.js";
import { renderDigestMarkdown, renderDigestJson } from "../src/digest/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> & { rule: string }): Finding {
  return {
    workspace: "ws-a",
    provider: "ci",
    severity: "warn",
    estMonthlyUsd: 0,
    title: "Test finding",
    detail: "Some detail text that should NOT appear in digest",
    fix: "Fix text that should NOT appear in digest",
    autofixable: false,
    ...overrides,
  };
}

const F1 = makeFinding({
  rule: "ci/double-trigger",
  workspace: "ws-a",
  provider: "ci",
  severity: "high",
  estMonthlyUsd: 50,
  title: "Double trigger",
  detail: "SECRET_DETAIL_CI push + pull_request on main",
  fix: "SECRET_FIX_CI remove push trigger",
  autofixable: true,
});

const F2 = makeFinding({
  rule: "cron/too-frequent",
  workspace: "ws-b",
  provider: "cron",
  severity: "warn",
  estMonthlyUsd: 20,
  title: "Too frequent",
  detail: "SECRET_DETAIL_CRON every minute",
  fix: "SECRET_FIX_CRON change to hourly",
});

const F3 = makeFinding({
  rule: "ci/long-jobs",
  workspace: "ws-a",
  provider: "ci",
  severity: "high",
  estMonthlyUsd: 30,
  title: "Long jobs",
  detail: "Some detail",
  fix: "Some fix",
});

const F4 = makeFinding({
  rule: "cron/missing-timeout",
  workspace: "ws-c",
  provider: "cron",
  severity: "info",
  estMonthlyUsd: 10,
  title: "Missing timeout",
  detail: "No timeout set",
  fix: "Add timeout",
});

const F5 = makeFinding({
  rule: "ci/no-cache",
  workspace: "ws-d",
  provider: "ci",
  severity: "warn",
  estMonthlyUsd: 8,
  title: "No cache",
  detail: "Cache not configured",
  fix: "Add cache step",
});

const F6 = makeFinding({
  rule: "ci/large-runner",
  workspace: "ws-e",
  provider: "ci",
  severity: "warn",
  estMonthlyUsd: 5,
  title: "Large runner",
  detail: "Using large runner unnecessarily",
  fix: "Downsize runner",
});

const ALL_FINDINGS = [F1, F2, F3, F4, F5, F6];
const META = { generatedAt: "2026-06-16T00:00:00.000Z", period: "2026-05" };

// ---------------------------------------------------------------------------
// renderDigestMarkdown
// ---------------------------------------------------------------------------

describe("renderDigestMarkdown", () => {
  it("header contains period", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    expect(md).toContain("2026-05");
  });

  it("header contains generatedAt", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    expect(md).toContain("2026-06-16T00:00:00.000Z");
  });

  it("summary contains total dollar amount", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    // total = 50+20+30+10+8+5 = 123
    expect(md).toMatch(/\$123\.00/);
  });

  it("summary contains finding count", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    expect(md).toMatch(/6 finding/);
  });

  it("summary contains high count", () => {
    // F1 and F3 are high
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    expect(md).toMatch(/2 high/);
  });

  it("provider table groups by provider and sorts by $ desc", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    // ci total = 50+30+8+5 = 93; cron total = 20+10 = 30
    expect(md).toContain("ci");
    expect(md).toContain("cron");
    // ci (93) should appear before cron (30)
    const ciIdx = md.indexOf("| ci");
    const cronIdx = md.indexOf("| cron");
    expect(ciIdx).toBeLessThan(cronIdx);
  });

  it("provider table contains formatted dollar amounts", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    expect(md).toMatch(/\$93\.00/);
    expect(md).toMatch(/\$30\.00/);
  });

  it("top findings table shows top 5 by $ (not 6th)", () => {
    // F6 has $5 which is 6th — should NOT appear in top-findings table
    // F1=$50 F3=$30 F2=$20 F4=$10 F5=$8 F6=$5
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    // The top-findings section heading
    expect(md).toContain("Top findings");
    // F6's rule should not appear in the top-5 table
    expect(md).not.toContain("ci/large-runner");
  });

  it("top findings table does NOT contain detail or fix text", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    expect(md).not.toContain("SECRET_DETAIL_CI");
    expect(md).not.toContain("SECRET_FIX_CI");
    expect(md).not.toContain("SECRET_DETAIL_CRON");
    expect(md).not.toContain("SECRET_FIX_CRON");
  });

  it("footer is present", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    expect(md).toContain("costguard report --last");
  });

  it("does not contain ANSI escape codes", () => {
    const md = renderDigestMarkdown(ALL_FINDINGS, META);
    // eslint-disable-next-line no-control-regex
    expect(md).not.toMatch(/\x1b/);
  });

  it("empty findings renders cleanly with $0.00 and 0 high", () => {
    const md = renderDigestMarkdown([], META);
    expect(md).toContain("$0.00");
    expect(md).toMatch(/0 finding/);
    expect(md).toMatch(/0 high/);
  });

  it("empty findings still has footer", () => {
    const md = renderDigestMarkdown([], META);
    expect(md).toContain("costguard report --last");
  });

  it("empty findings still has period in header", () => {
    const md = renderDigestMarkdown([], META);
    expect(md).toContain("2026-05");
  });
});

// ---------------------------------------------------------------------------
// renderDigestJson
// ---------------------------------------------------------------------------

describe("renderDigestJson", () => {
  it("round-trips via JSON.parse", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("has period field", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    const parsed = JSON.parse(json) as { period: string };
    expect(parsed.period).toBe("2026-05");
  });

  it("has generatedAt field", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    const parsed = JSON.parse(json) as { generatedAt: string };
    expect(parsed.generatedAt).toBe("2026-06-16T00:00:00.000Z");
  });

  it("has correct totalMonthlyUsd", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    const parsed = JSON.parse(json) as { totalMonthlyUsd: number };
    expect(parsed.totalMonthlyUsd).toBeCloseTo(123, 5);
  });

  it("has correct highCount", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    const parsed = JSON.parse(json) as { highCount: number };
    expect(parsed.highCount).toBe(2);
  });

  it("providerBreakdown has correct structure", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    const parsed = JSON.parse(json) as {
      providerBreakdown: Array<{ provider: string; count: number; total: number }>;
    };
    expect(Array.isArray(parsed.providerBreakdown)).toBe(true);
    const ci = parsed.providerBreakdown.find((p) => p.provider === "ci");
    expect(ci).toBeDefined();
    expect(ci!.count).toBe(4);
    expect(ci!.total).toBeCloseTo(93, 5);
  });

  it("providerBreakdown sorted by $ desc", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    const parsed = JSON.parse(json) as {
      providerBreakdown: Array<{ provider: string; total: number }>;
    };
    // ci=93 before cron=30
    expect(parsed.providerBreakdown[0]!.provider).toBe("ci");
    expect(parsed.providerBreakdown[1]!.provider).toBe("cron");
  });

  it("topFindings has at most 5 entries", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    const parsed = JSON.parse(json) as { topFindings: unknown[] };
    expect(parsed.topFindings.length).toBeLessThanOrEqual(5);
  });

  it("topFindings sorted by $ desc", () => {
    const json = renderDigestJson(ALL_FINDINGS, META);
    const parsed = JSON.parse(json) as {
      topFindings: Array<{ estMonthlyUsd: number }>;
    };
    expect(parsed.topFindings[0]!.estMonthlyUsd).toBe(50);
  });

  it("empty findings returns zeroed structure", () => {
    const json = renderDigestJson([], META);
    const parsed = JSON.parse(json) as {
      totalMonthlyUsd: number;
      highCount: number;
      providerBreakdown: unknown[];
      topFindings: unknown[];
    };
    expect(parsed.totalMonthlyUsd).toBe(0);
    expect(parsed.highCount).toBe(0);
    expect(parsed.providerBreakdown).toHaveLength(0);
    expect(parsed.topFindings).toHaveLength(0);
  });
});
