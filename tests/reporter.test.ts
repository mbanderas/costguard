import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Finding } from "../src/types.js";
import { sortFindings, renderMarkdown, renderJson } from "../src/reporter/index.js";
import { saveRun, loadLastRun } from "../src/reporter/persist.js";
import { renderDigestMarkdown } from "../src/digest/renderer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> & { rule: string }): Finding {
  return {
    workspace: "ws-a",
    provider: "ci",
    severity: "warn",
    estMonthlyUsd: 0,
    title: "Test finding",
    detail: "Some detail",
    fix: "Fix it",
    autofixable: false,
    ...overrides,
  };
}

const HIGH_FINDING = makeFinding({
  rule: "ci/double-trigger",
  workspace: "ws-a",
  severity: "high",
  estMonthlyUsd: 12,
  title: "Double trigger",
  detail: "push + pull_request on main",
  fix: "Remove push trigger",
  autofixable: true,
});

const WARN_FINDING = makeFinding({
  rule: "cron/too-frequent",
  workspace: "ws-b",
  provider: "cron",
  severity: "warn",
  estMonthlyUsd: 5,
  title: "Too frequent",
  detail: "Every minute",
  fix: "Change to hourly",
});

const INFO_FINDING = makeFinding({
  rule: "ci/actionlint-unavailable",
  workspace: "ws-a",
  severity: "info",
  estMonthlyUsd: 0,
  title: "Actionlint not found",
  detail: "actionlint binary not on PATH",
  fix: "Install actionlint",
});

// ---------------------------------------------------------------------------
// sortFindings
// ---------------------------------------------------------------------------

describe("sortFindings", () => {
  it("sorts by estMonthlyUsd descending", () => {
    const findings = [INFO_FINDING, HIGH_FINDING, WARN_FINDING];
    const sorted = sortFindings(findings);
    expect(sorted[0]!.estMonthlyUsd).toBe(12);
    expect(sorted[1]!.estMonthlyUsd).toBe(5);
    expect(sorted[2]!.estMonthlyUsd).toBe(0);
  });

  it("does not mutate the input array", () => {
    const findings = [HIGH_FINDING, WARN_FINDING, INFO_FINDING];
    const original = [...findings];
    sortFindings(findings);
    expect(findings).toEqual(original);
  });

  it("tie-breaks: high severity before warn before info at same $", () => {
    const a = makeFinding({ rule: "ci/a", severity: "info", estMonthlyUsd: 12 });
    const b = makeFinding({ rule: "ci/b", severity: "high", estMonthlyUsd: 12 });
    const c = makeFinding({ rule: "ci/c", severity: "warn", estMonthlyUsd: 12 });
    const sorted = sortFindings([a, b, c]);
    expect(sorted[0]!.severity).toBe("high");
    expect(sorted[1]!.severity).toBe("warn");
    expect(sorted[2]!.severity).toBe("info");
  });

  it("tie-breaks: rule ascending when severity also ties", () => {
    const a = makeFinding({ rule: "ci/zzz", severity: "warn", estMonthlyUsd: 5 });
    const b = makeFinding({ rule: "ci/aaa", severity: "warn", estMonthlyUsd: 5 });
    const sorted = sortFindings([a, b]);
    expect(sorted[0]!.rule).toBe("ci/aaa");
    expect(sorted[1]!.rule).toBe("ci/zzz");
  });

  it("returns a new array instance", () => {
    const findings = [HIGH_FINDING];
    const sorted = sortFindings(findings);
    expect(sorted).not.toBe(findings);
  });
});

// ---------------------------------------------------------------------------
// renderMarkdown
// ---------------------------------------------------------------------------

describe("renderMarkdown", () => {
  const META = { generatedAt: "2026-06-16T00:00:00.000Z" };

  it("includes grand total line", () => {
    const md = renderMarkdown([HIGH_FINDING, WARN_FINDING], META);
    expect(md).toMatch(/\$17\.00\/mo/);
  });

  it("groups findings by workspace", () => {
    const md = renderMarkdown([HIGH_FINDING, WARN_FINDING, INFO_FINDING], META);
    expect(md).toMatch(/ws-a/);
    expect(md).toMatch(/ws-b/);
  });

  it("workspace group order is by group subtotal desc", () => {
    const md = renderMarkdown([WARN_FINDING, HIGH_FINDING], META);
    const idxA = md.indexOf("ws-a");
    const idxB = md.indexOf("ws-b");
    // ws-a has $12, ws-b has $5 — ws-a must appear first
    expect(idxA).toBeLessThan(idxB);
  });

  it("includes severity badge for each finding", () => {
    const md = renderMarkdown([HIGH_FINDING], META);
    expect(md).toMatch(/high/i);
  });

  it("includes rule id", () => {
    const md = renderMarkdown([HIGH_FINDING], META);
    expect(md).toContain("ci/double-trigger");
  });

  it("includes fix text", () => {
    const md = renderMarkdown([HIGH_FINDING], META);
    expect(md).toContain("Remove push trigger");
  });

  it("includes detail text", () => {
    const md = renderMarkdown([HIGH_FINDING], META);
    expect(md).toContain("push + pull_request on main");
  });

  it("renders clean 'No findings' report for empty array", () => {
    const md = renderMarkdown([], META);
    expect(md).toMatch(/no findings/i);
    expect(md).toContain("$0.00");
  });

  it("includes generatedAt metadata", () => {
    const md = renderMarkdown([HIGH_FINDING], META);
    expect(md).toContain("2026-06-16T00:00:00.000Z");
  });

  it("does not contain ANSI escape codes", () => {
    const md = renderMarkdown([HIGH_FINDING, WARN_FINDING], META);
    // eslint-disable-next-line no-control-regex
    expect(md).not.toMatch(/\x1b\[/);
  });
});

// ---------------------------------------------------------------------------
// renderJson
// ---------------------------------------------------------------------------

describe("renderJson", () => {
  const META = { generatedAt: "2026-06-16T00:00:00.000Z" };

  it("round-trips via JSON.parse", () => {
    const json = renderJson([HIGH_FINDING, WARN_FINDING], META);
    const parsed = JSON.parse(json) as unknown;
    expect(typeof parsed).toBe("object");
  });

  it("totalMonthlyUsd equals sum of all findings", () => {
    const json = renderJson([HIGH_FINDING, WARN_FINDING], META);
    const parsed = JSON.parse(json) as { totalMonthlyUsd: number };
    expect(parsed.totalMonthlyUsd).toBeCloseTo(17, 5);
  });

  it("includes generatedAt field", () => {
    const json = renderJson([HIGH_FINDING], META);
    const parsed = JSON.parse(json) as { generatedAt: string };
    expect(parsed.generatedAt).toBe("2026-06-16T00:00:00.000Z");
  });

  it("findings array is sorted by $ desc in JSON output", () => {
    const json = renderJson([WARN_FINDING, HIGH_FINDING], META);
    const parsed = JSON.parse(json) as { findings: Finding[] };
    expect(parsed.findings[0]!.estMonthlyUsd).toBe(12);
    expect(parsed.findings[1]!.estMonthlyUsd).toBe(5);
  });

  it("empty findings produces totalMonthlyUsd=0 and empty array", () => {
    const json = renderJson([], META);
    const parsed = JSON.parse(json) as { totalMonthlyUsd: number; findings: unknown[] };
    expect(parsed.totalMonthlyUsd).toBe(0);
    expect(parsed.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// saveRun / loadLastRun  (uses a temp dir override via env)
// ---------------------------------------------------------------------------

// Determine which env var os.homedir() uses on this platform
const HOME_ENV_KEY = process.platform === "win32" ? "USERPROFILE" : "HOME";

describe("saveRun / loadLastRun", () => {
  let tmpDir: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "costguard-test-"));
    origHome = process.env[HOME_ENV_KEY];
    // Override the home-dir env var so dataDir() resolves inside tmpDir
    process.env[HOME_ENV_KEY] = tmpDir;
  });

  afterEach(() => {
    if (origHome !== undefined) {
      process.env[HOME_ENV_KEY] = origHome;
    } else {
      delete process.env[HOME_ENV_KEY];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saveRun writes file and returns PersistedRun with findings", () => {
    const run = saveRun([HIGH_FINDING]);
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0]!.rule).toBe("ci/double-trigger");
    expect(typeof run.generatedAt).toBe("string");
  });

  it("loadLastRun returns null when no file exists", () => {
    const result = loadLastRun();
    expect(result).toBeNull();
  });

  it("loadLastRun returns the persisted run after saveRun", () => {
    saveRun([HIGH_FINDING, WARN_FINDING]);
    const loaded = loadLastRun();
    expect(loaded).not.toBeNull();
    expect(loaded!.findings).toHaveLength(2);
  });

  it("loadLastRun throws on malformed JSON file", () => {
    const dir = path.join(tmpDir, ".costguard");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "last-run.json"), "{ not valid json");
    expect(() => loadLastRun()).toThrow();
  });

  it("loadLastRun throws on invalid shape", () => {
    const dir = path.join(tmpDir, ".costguard");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "last-run.json"), JSON.stringify({ bad: true }));
    expect(() => loadLastRun()).toThrow(/invalid/i);
  });
});

// ---------------------------------------------------------------------------
// Diagnostic kind segregation — renderJson totalMonthlyUsd
// ---------------------------------------------------------------------------

describe("renderJson — diagnostic kind exclusion", () => {
  const META = { generatedAt: "2026-06-17T00:00:00.000Z" };

  it("totalMonthlyUsd excludes diagnostic findings", () => {
    const diagnostic = makeFinding({
      rule: "ci/actionlint-unavailable",
      estMonthlyUsd: 5,
      kind: "diagnostic",
    });
    const json = renderJson([HIGH_FINDING, diagnostic], META);
    const parsed = JSON.parse(json) as { totalMonthlyUsd: number; findings: Finding[] };
    // Only HIGH_FINDING ($12) should count; diagnostic ($5) excluded from total
    expect(parsed.totalMonthlyUsd).toBeCloseTo(12, 5);
    // Both findings still present in the array
    expect(parsed.findings).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Diagnostic kind segregation — renderMarkdown Notices section
// ---------------------------------------------------------------------------

describe("renderMarkdown — diagnostic kind exclusion", () => {
  const META = { generatedAt: "2026-06-17T00:00:00.000Z" };

  it("emits a ## Notices section when diagnostic findings are present", () => {
    const diagnostic = makeFinding({
      rule: "ci/actionlint-unavailable",
      estMonthlyUsd: 5,
      kind: "diagnostic",
      title: "actionlint not on PATH",
      detail: "Install actionlint",
    });
    const md = renderMarkdown([HIGH_FINDING, diagnostic], META);
    expect(md).toContain("## Notices");
    expect(md).toContain("ci/actionlint-unavailable");
  });

  it("diagnostic finding does not appear in workspace cost group", () => {
    const diagnostic = makeFinding({
      rule: "ci/actionlint-unavailable",
      workspace: "ws-a",
      estMonthlyUsd: 5,
      kind: "diagnostic",
      title: "actionlint not on PATH",
    });
    const md = renderMarkdown([HIGH_FINDING, diagnostic], META);
    // Grand total must be $12 (not $17)
    expect(md).toContain("$12.00/mo");
    expect(md).not.toMatch(/\$17\.00/);
  });

  it("grand total excludes diagnostic estMonthlyUsd", () => {
    const diagnostic = makeFinding({
      rule: "ci/actionlint-unavailable",
      estMonthlyUsd: 5,
      kind: "diagnostic",
    });
    const md = renderMarkdown([HIGH_FINDING, diagnostic], META);
    expect(md).toMatch(/\$12\.00\/mo/);
  });

  it("no Notices section when no diagnostics present", () => {
    const md = renderMarkdown([HIGH_FINDING, WARN_FINDING], META);
    expect(md).not.toContain("## Notices");
  });
});

// ---------------------------------------------------------------------------
// Diagnostic kind segregation — renderDigestMarkdown
// ---------------------------------------------------------------------------

describe("renderDigestMarkdown — diagnostic kind exclusion", () => {
  const META = { generatedAt: "2026-06-17T00:00:00.000Z", period: "2026-06" };

  it("highCount excludes diagnostic findings", () => {
    const diagnostic = makeFinding({
      rule: "ci/actionlint-unavailable",
      severity: "high",
      estMonthlyUsd: 5,
      kind: "diagnostic",
    });
    // HIGH_FINDING is high + cost, diagnostic is high but diagnostic kind
    const md = renderDigestMarkdown([HIGH_FINDING, diagnostic], META);
    // Only 1 high (HIGH_FINDING), diagnostic excluded
    expect(md).toMatch(/1 high/);
  });

  it("total excludes diagnostic findings", () => {
    const diagnostic = makeFinding({
      rule: "ci/actionlint-unavailable",
      estMonthlyUsd: 5,
      kind: "diagnostic",
    });
    const md = renderDigestMarkdown([HIGH_FINDING, diagnostic], META);
    // Total should be $12.00 (HIGH_FINDING only)
    expect(md).toContain("$12.00");
    expect(md).not.toMatch(/\$17\.00/);
  });

  it("finding count excludes diagnostic findings", () => {
    const diagnostic = makeFinding({
      rule: "ci/actionlint-unavailable",
      estMonthlyUsd: 5,
      kind: "diagnostic",
    });
    const md = renderDigestMarkdown([HIGH_FINDING, diagnostic], META);
    // Only 1 cost finding
    expect(md).toMatch(/1 finding/);
  });
});
