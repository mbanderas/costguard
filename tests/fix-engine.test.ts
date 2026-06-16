import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFixEngine } from "../src/fix/engine.js";
import type { Finding } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");
const baseFixture = path.join(fixturesDir, "workflow-fix-base.yml");

const tmpDirs: string[] = [];

function makeTmpWorkspace(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cg-fix-"));
  tmpDirs.push(tmp);
  const workflowsDir = path.join(tmp, ".github", "workflows");
  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.copyFileSync(baseFixture, path.join(workflowsDir, "ci.yml"));
  return tmp;
}

function makeFindings(
  workspaceDir: string,
  rules: string[],
  overrides?: Partial<Finding>,
): Finding[] {
  return rules.map((rule) => ({
    workspace: "test",
    provider: "ci",
    rule,
    severity: "warn" as const,
    estMonthlyUsd: 0,
    title: `${rule} violation`,
    detail: "ci.yml#on.push: trigger without paths-ignore",
    fix: "Add paths-ignore",
    autofixable: true,
    ...overrides,
  }));
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe("runFixEngine", () => {
  it("dry-run (apply:false): returns 1 result with all 3 applied rules; disk file unchanged", () => {
    const workspaceDir = makeTmpWorkspace();
    const workflowFile = path.join(workspaceDir, ".github", "workflows", "ci.yml");
    const originalContent = fs.readFileSync(workflowFile, "utf8");

    const findings = makeFindings(workspaceDir, [
      "ci/no-paths-ignore",
      "ci/no-concurrency",
      "ci/no-timeout",
    ]);

    const results = runFixEngine({ findings, workspaceDir, apply: false });

    expect(results).toHaveLength(1);
    expect(results[0]?.appliedRules).toHaveLength(3);

    // Disk file must be unchanged
    const diskContent = fs.readFileSync(workflowFile, "utf8");
    expect(diskContent).toBe(originalContent);
  });

  it("apply:true: writes file; patched content contains fixes; re-run returns [] (idempotent)", () => {
    const workspaceDir = makeTmpWorkspace();
    const workflowFile = path.join(workspaceDir, ".github", "workflows", "ci.yml");

    const findings = makeFindings(workspaceDir, [
      "ci/no-paths-ignore",
      "ci/no-concurrency",
      "ci/no-timeout",
    ]);

    const results = runFixEngine({ findings, workspaceDir, apply: true });

    expect(results).toHaveLength(1);

    const diskContent = fs.readFileSync(workflowFile, "utf8");
    expect(diskContent).toContain("paths-ignore");
    expect(diskContent).toContain("concurrency");
    expect(diskContent).toContain("timeout-minutes");

    // Idempotent: second apply on already-patched file
    const results2 = runFixEngine({ findings, workspaceDir, apply: true });
    expect(results2).toHaveLength(0);
  });

  it("judgment rules skipped: ci/double-trigger and ci/matrix-overkill have no fixer -> []", () => {
    const workspaceDir = makeTmpWorkspace();

    const findings = makeFindings(workspaceDir, [
      "ci/double-trigger",
      "ci/matrix-overkill",
    ]);

    const results = runFixEngine({ findings, workspaceDir, apply: false });
    expect(results).toHaveLength(0);
  });

  it("provider findings skipped: provider:github autofixable:false -> []", () => {
    const workspaceDir = makeTmpWorkspace();

    const findings: Finding[] = [
      {
        workspace: "test",
        provider: "github",
        rule: "ci/no-paths-ignore",
        severity: "warn",
        estMonthlyUsd: 0,
        title: "paths-ignore missing",
        detail: "ci.yml#on.push: trigger without paths-ignore",
        fix: "Add paths-ignore",
        autofixable: false,
      },
    ];

    const results = runFixEngine({ findings, workspaceDir, apply: false });
    expect(results).toHaveLength(0);
  });

  it("no .github/workflows dir -> []", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cg-fix-nodir-"));
    tmpDirs.push(tmp);

    const findings = makeFindings(tmp, ["ci/no-paths-ignore"]);
    const results = runFixEngine({ findings, workspaceDir: tmp, apply: false });
    expect(results).toHaveLength(0);
  });
});
