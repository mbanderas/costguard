import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCronHits } from "../src/checks/cron/parser.js";
import { cronCheck } from "../src/checks/cron/index.js";
import type { CheckContext } from "../src/types.js";
import type { ResolvedWorkspaceConfig } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturesDir = path.join(__dirname, "fixtures");

function makeCtx(
  fixtureDir: string,
  overrides: Partial<ResolvedWorkspaceConfig> = {},
): CheckContext {
  const config: ResolvedWorkspaceConfig = {
    cronThresholdMinutes: 15,
    ciMinuteRate: 0.008,
    assumedPushesPerDay: 10,
    assumedMinutesPerRun: 5,
    ...overrides,
  };
  return {
    workspace: "test-workspace",
    workspaceDir: fixtureDir,
    config,
  };
}

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe("findCronHits - clean fixture", () => {
  const dir = path.join(fixturesDir, "cron-clean");

  it("finds vercel cron", async () => {
    const hits = await findCronHits(dir);
    const vercel = hits.filter((h) => h.source === "vercel");
    expect(vercel).toHaveLength(1);
    expect(vercel[0]?.expr).toBe("0 6 * * *");
  });

  it("finds inngest cron", async () => {
    const hits = await findCronHits(dir);
    const inngest = hits.filter((h) => h.source === "inngest");
    expect(inngest).toHaveLength(1);
    expect(inngest[0]?.expr).toBe("0 * * * *");
  });

  it("marks inngest hit as guarded (singletonKey within 5 lines)", async () => {
    const hits = await findCronHits(dir);
    const inngest = hits.filter((h) => h.source === "inngest");
    expect(inngest[0]?.guarded).toBe(true);
  });
});

describe("findCronHits - wasteful fixture", () => {
  const dir = path.join(fixturesDir, "cron-wasteful");

  it("finds vercel every-minute cron", async () => {
    const hits = await findCronHits(dir);
    const vercel = hits.filter((h) => h.source === "vercel");
    expect(vercel).toHaveLength(1);
    expect(vercel[0]?.expr).toBe("* * * * *");
  });

  it("finds pg_cron hit in sql migration", async () => {
    const hits = await findCronHits(dir);
    const pg = hits.filter((h) => h.source === "pg_cron");
    expect(pg).toHaveLength(1);
    expect(pg[0]?.expr).toBe("*/2 * * * *");
  });

  it("finds two inngest cron hits", async () => {
    const hits = await findCronHits(dir);
    const inngest = hits.filter((h) => h.source === "inngest");
    expect(inngest).toHaveLength(2);
    const exprs = inngest.map((h) => h.expr).sort();
    expect(exprs).toEqual(["*/2 * * * *", "*/5 * * * *"]);
  });
});

// ---------------------------------------------------------------------------
// Rule tests — clean tree: zero findings
// ---------------------------------------------------------------------------

describe("cronCheck - clean fixture", () => {
  it("produces zero findings", async () => {
    const ctx = makeCtx(path.join(fixturesDir, "cron-clean"));
    const findings = await cronCheck(ctx);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule tests — wasteful tree
// ---------------------------------------------------------------------------

describe("cronCheck - wasteful fixture", () => {
  it("reports cron/too-frequent for every-minute and every-5-minute crons", async () => {
    const ctx = makeCtx(path.join(fixturesDir, "cron-wasteful"));
    const findings = await cronCheck(ctx);
    const tooFrequent = findings.filter((f) => f.rule === "cron/too-frequent");
    // * * * * * (1 min) and */5 * * * * (5 min) are both below threshold of 15
    // */2 * * * * (2 min) is also below threshold
    expect(tooFrequent.length).toBeGreaterThanOrEqual(2);
    expect(tooFrequent.every((f) => f.severity === "high")).toBe(true);
    expect(tooFrequent.every((f) => f.autofixable === true)).toBe(true);
  });

  it("reports cron/overlap for identical */2 expressions", async () => {
    const ctx = makeCtx(path.join(fixturesDir, "cron-wasteful"));
    const findings = await cronCheck(ctx);
    const overlap = findings.filter((f) => f.rule === "cron/overlap");
    expect(overlap.length).toBeGreaterThanOrEqual(1);
    expect(overlap.every((f) => f.severity === "warn")).toBe(true);
    expect(overlap.every((f) => f.autofixable === false)).toBe(true);
  });

  it("reports cron/unbounded for unguarded hits", async () => {
    const ctx = makeCtx(path.join(fixturesDir, "cron-wasteful"));
    const findings = await cronCheck(ctx);
    const unbounded = findings.filter((f) => f.rule === "cron/unbounded");
    expect(unbounded.length).toBeGreaterThanOrEqual(1);
    expect(unbounded.every((f) => f.severity === "warn")).toBe(true);
    expect(unbounded.every((f) => f.autofixable === false)).toBe(true);
  });

  it("all findings have provider=cron and workspace=test-workspace", async () => {
    const ctx = makeCtx(path.join(fixturesDir, "cron-wasteful"));
    const findings = await cronCheck(ctx);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.provider === "cron")).toBe(true);
    expect(findings.every((f) => f.workspace === "test-workspace")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Threshold override: a 10-min cron should NOT fire too-frequent at threshold=5
// ---------------------------------------------------------------------------

describe("cronCheck - threshold override", () => {
  it("10-min interval does not fire too-frequent when threshold=5", async () => {
    // We use the clean fixture but with a custom threshold of 5.
    // The hourly cron (60 min) won't fire. We need a 10-min test hit.
    // We synthesize by calling applyRules directly with a synthetic CronHit.
    const { applyRules: applyRulesDirect } = await import(
      "../src/checks/cron/rules.js"
    );
    const ctx = makeCtx(path.join(fixturesDir, "cron-clean"), {
      cronThresholdMinutes: 5,
    });
    const syntheticHit = {
      expr: "*/10 * * * *",
      file: "fake.ts",
      line: 1,
      source: "inngest" as const,
      guarded: true,
    };
    const findings = applyRulesDirect([syntheticHit], ctx);
    const tooFrequent = findings.filter((f) => f.rule === "cron/too-frequent");
    // 10 min >= 5 min threshold, so should NOT fire
    expect(tooFrequent).toHaveLength(0);
  });

  it("10-min interval DOES fire too-frequent at default threshold=15", async () => {
    const ctx = makeCtx(path.join(fixturesDir, "cron-clean")); // threshold=15
    const { applyRules: applyRulesDirect } = await import(
      "../src/checks/cron/rules.js"
    );
    const syntheticHit = {
      expr: "*/10 * * * *",
      file: "fake.ts",
      line: 1,
      source: "inngest" as const,
      guarded: true,
    };
    const findings = applyRulesDirect([syntheticHit], ctx);
    const tooFrequent = findings.filter((f) => f.rule === "cron/too-frequent");
    // 10 min < 15 min threshold, so SHOULD fire
    expect(tooFrequent).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Unit test: interval computation via applyRules
// ---------------------------------------------------------------------------

describe("interval computation", () => {
  it("correctly computes 1-min interval for * * * * *", async () => {
    const { applyRules: applyRulesDirect } = await import(
      "../src/checks/cron/rules.js"
    );
    const ctx = makeCtx(path.join(fixturesDir, "cron-clean"), {
      cronThresholdMinutes: 15,
    });
    const hit = {
      expr: "* * * * *",
      file: "test.ts",
      line: 1,
      source: "node-cron" as const,
      guarded: true,
    };
    const findings = applyRulesDirect([hit], ctx);
    const tf = findings.filter((f) => f.rule === "cron/too-frequent");
    expect(tf).toHaveLength(1);
    // detail should mention invocations/month — 1440 per day * 30 = 43200
    expect(tf[0]?.detail).toMatch(/43200/);
  });
});
