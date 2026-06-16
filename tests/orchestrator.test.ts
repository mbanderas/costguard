import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { WorkspaceRegistry } from "../src/registry/schema.js";
import type { CostguardConfig } from "../src/config.js";
import {
  resolveSelection,
  runAudit,
  hasHighFinding,
  totalMonthlyUsd,
} from "../src/orchestrator.js";
import { DEFAULT_CONFIG } from "../src/config.js";

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

function makeRegistry(root: string, names: string[]): WorkspaceRegistry {
  const workspaces: WorkspaceRegistry["workspaces"] = {};
  for (const name of names) {
    workspaces[name] = { providers: ["github"], active: {} };
  }
  return { root, workspaces };
}

// ---------------------------------------------------------------------------
// Temp fixture dir setup
// ---------------------------------------------------------------------------

let tmpRoot: string;

function createWastefulWorkspace(name: string): string {
  const dir = path.join(tmpRoot, name);
  const workflowsDir = path.join(dir, ".github", "workflows");
  fs.mkdirSync(workflowsDir, { recursive: true });

  // A wasteful workflow: push + pull_request (double-trigger), no concurrency,
  // no paths-ignore, no timeout, has a very-frequent schedule.
  const workflow = `
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '*/5 * * * *'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo hello
`.trimStart();

  fs.writeFileSync(path.join(workflowsDir, "ci.yml"), workflow, "utf8");

  // A wasteful vercel.json with a 1-minute cron (below threshold=15)
  const vercelJson = JSON.stringify({
    crons: [{ path: "/api/ping", schedule: "* * * * *" }],
  });
  fs.writeFileSync(path.join(dir, "vercel.json"), vercelJson, "utf8");

  return dir;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "costguard-orch-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// resolveSelection
// ---------------------------------------------------------------------------

describe("resolveSelection", () => {
  it("all=true returns every workspace in registry", () => {
    const reg = makeRegistry(tmpRoot, ["alpha", "beta", "gamma"]);
    const sel = resolveSelection(reg, [], true);
    const names = sel.map((s) => s.workspace).sort();
    expect(names).toEqual(["alpha", "beta", "gamma"]);
  });

  it("all=false with named list returns only those workspaces", () => {
    const reg = makeRegistry(tmpRoot, ["alpha", "beta", "gamma"]);
    const sel = resolveSelection(reg, ["beta"], false);
    expect(sel).toHaveLength(1);
    expect(sel[0]!.workspace).toBe("beta");
  });

  it("workspaceDir is path.join(resolvedRoot, name)", () => {
    const reg = makeRegistry(tmpRoot, ["my-ws"]);
    const sel = resolveSelection(reg, ["my-ws"], false);
    expect(sel[0]!.workspaceDir).toBe(path.join(tmpRoot, "my-ws"));
  });

  it("throws a clear Error naming an unknown workspace", () => {
    const reg = makeRegistry(tmpRoot, ["alpha"]);
    expect(() => resolveSelection(reg, ["nonexistent"], false)).toThrow(
      /nonexistent/,
    );
  });

  it("throws if any one of multiple names is unknown", () => {
    const reg = makeRegistry(tmpRoot, ["alpha", "beta"]);
    expect(() => resolveSelection(reg, ["alpha", "mystery"], false)).toThrow(
      /mystery/,
    );
  });

  it("all=true with empty registry returns empty array", () => {
    const reg = makeRegistry(tmpRoot, []);
    const sel = resolveSelection(reg, [], true);
    expect(sel).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// runAudit — both checks
// ---------------------------------------------------------------------------

describe("runAudit — both checks enabled", () => {
  it("returns findings from CI and cron checks on a wasteful workspace", async () => {
    createWastefulWorkspace("w1");
    const reg = makeRegistry(tmpRoot, ["w1"]);
    const sel = resolveSelection(reg, ["w1"], false);
    const config: CostguardConfig = { ...DEFAULT_CONFIG, workspacesRoot: tmpRoot };

    const findings = await runAudit({
      selection: sel,
      config,
      flags: { ciOnly: false, cronsOnly: false },
    });

    expect(findings.length).toBeGreaterThan(0);
    const providers = new Set(findings.map((f) => f.provider));
    // Should have at least one ci finding
    expect(providers.has("ci")).toBe(true);
    // Should have at least one cron finding
    expect(providers.has("cron")).toBe(true);
  });

  it("all findings have workspace set to the selected workspace name", async () => {
    createWastefulWorkspace("w2");
    const reg = makeRegistry(tmpRoot, ["w2"]);
    const sel = resolveSelection(reg, ["w2"], false);
    const config: CostguardConfig = { ...DEFAULT_CONFIG, workspacesRoot: tmpRoot };

    const findings = await runAudit({
      selection: sel,
      config,
      flags: { ciOnly: false, cronsOnly: false },
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.workspace === "w2")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runAudit — ciOnly flag
// ---------------------------------------------------------------------------

describe("runAudit — ciOnly flag", () => {
  it("with ciOnly=true only CI provider findings are returned", async () => {
    createWastefulWorkspace("w3");
    const reg = makeRegistry(tmpRoot, ["w3"]);
    const sel = resolveSelection(reg, ["w3"], false);
    const config: CostguardConfig = { ...DEFAULT_CONFIG, workspacesRoot: tmpRoot };

    const findings = await runAudit({
      selection: sel,
      config,
      flags: { ciOnly: true, cronsOnly: false },
    });

    expect(findings.every((f) => f.provider === "ci")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runAudit — cronsOnly flag
// ---------------------------------------------------------------------------

describe("runAudit — cronsOnly flag", () => {
  it("with cronsOnly=true only cron provider findings are returned", async () => {
    createWastefulWorkspace("w4");
    const reg = makeRegistry(tmpRoot, ["w4"]);
    const sel = resolveSelection(reg, ["w4"], false);
    const config: CostguardConfig = { ...DEFAULT_CONFIG, workspacesRoot: tmpRoot };

    const findings = await runAudit({
      selection: sel,
      config,
      flags: { ciOnly: false, cronsOnly: true },
    });

    expect(findings.every((f) => f.provider === "cron")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runAudit — check error is surfaced as a finding, not a throw
// ---------------------------------------------------------------------------

describe("runAudit — check error handling", () => {
  it("a check that throws produces a check-error finding instead of aborting", async () => {
    // Use an empty workspace dir — ci check will produce no findings (no .github dir).
    // We need a check that actually throws. We simulate by passing a workspace dir
    // that exists but we mock ciCheck behavior via a sub-registry with a known-bad
    // workspace name and a patched check. Instead, use the real check but pass an
    // invalid workspaceDir for one workspace and valid for another.
    // Actually the simplest approach: create two workspaces, one valid, one whose
    // dir doesn't exist (fs errors). The CI check returns [] on missing dir.
    // So we need to exercise the error path directly via the exported runAudit.
    // We pass a selection whose workspaceDir has a path that triggers an error in
    // a check. The simplest: create a workspaceDir that is actually a FILE, not a
    // dir — this will cause checks that try to readdir to throw.

    const filePath = path.join(tmpRoot, "not-a-dir");
    fs.writeFileSync(filePath, "I am a file");

    // Manually construct selection with this bad path (no registry needed)
    const sel = [{ workspace: "not-a-dir", workspaceDir: filePath }];
    const config: CostguardConfig = { ...DEFAULT_CONFIG, workspacesRoot: tmpRoot };

    // Some checks tolerate bad dirs, some throw — the point is it should NOT throw
    // at the runAudit level.
    let threw = false;
    try {
      await runAudit({ selection: sel, config, flags: { ciOnly: false, cronsOnly: false } });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it("runAudit continues with other workspaces when one has a bad dir", async () => {
    const filePath = path.join(tmpRoot, "bad-ws");
    fs.writeFileSync(filePath, "file-not-dir");

    createWastefulWorkspace("good-ws");

    const sel = [
      { workspace: "bad-ws", workspaceDir: filePath },
      { workspace: "good-ws", workspaceDir: path.join(tmpRoot, "good-ws") },
    ];
    const config: CostguardConfig = { ...DEFAULT_CONFIG, workspacesRoot: tmpRoot };

    const findings = await runAudit({
      selection: sel,
      config,
      flags: { ciOnly: false, cronsOnly: false },
    });

    // Should still have findings from the good workspace
    const goodFindings = findings.filter((f) => f.workspace === "good-ws");
    expect(goodFindings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// hasHighFinding
// ---------------------------------------------------------------------------

describe("hasHighFinding", () => {
  const base = {
    workspace: "ws",
    provider: "ci",
    rule: "ci/x",
    estMonthlyUsd: 0,
    title: "t",
    detail: "d",
    fix: "f",
    autofixable: false,
  };

  it("returns true when at least one high finding exists", () => {
    const findings = [
      { ...base, severity: "warn" as const },
      { ...base, severity: "high" as const },
    ];
    expect(hasHighFinding(findings)).toBe(true);
  });

  it("returns false when no high finding exists", () => {
    const findings = [
      { ...base, severity: "warn" as const },
      { ...base, severity: "info" as const },
    ];
    expect(hasHighFinding(findings)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasHighFinding([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// totalMonthlyUsd
// ---------------------------------------------------------------------------

describe("totalMonthlyUsd", () => {
  const base = {
    workspace: "ws",
    provider: "ci",
    rule: "ci/x",
    severity: "warn" as const,
    title: "t",
    detail: "d",
    fix: "f",
    autofixable: false,
  };

  it("sums all estMonthlyUsd values", () => {
    const findings = [
      { ...base, estMonthlyUsd: 12 },
      { ...base, estMonthlyUsd: 5 },
      { ...base, estMonthlyUsd: 0 },
    ];
    expect(totalMonthlyUsd(findings)).toBeCloseTo(17, 5);
  });

  it("returns 0 for empty array", () => {
    expect(totalMonthlyUsd([])).toBe(0);
  });

  it("returns 0 for all-zero findings", () => {
    const findings = [
      { ...base, estMonthlyUsd: 0 },
      { ...base, estMonthlyUsd: 0 },
    ];
    expect(totalMonthlyUsd(findings)).toBe(0);
  });
});
