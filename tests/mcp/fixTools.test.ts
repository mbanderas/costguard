import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planFixHandler } from "../../src/mcp/tools/planFix.js";
import { applyFixHandler } from "../../src/mcp/tools/applyFix.js";
import type { EngineResult } from "../../src/fix/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseFixture = path.join(__dirname, "..", "fixtures", "workflow-fix-base.yml");

const tmpDirs: string[] = [];

function makeWorkspace(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cg-mcp-fix-"));
  tmpDirs.push(tmp);
  const wf = path.join(tmp, ".github", "workflows");
  fs.mkdirSync(wf, { recursive: true });
  fs.copyFileSync(baseFixture, path.join(wf, "ci.yml"));
  return tmp;
}

const gatedFindings = ["ci/no-paths-ignore", "ci/no-concurrency", "ci/no-timeout"].map((rule) => ({
  workspace: "test",
  provider: "ci",
  rule,
  severity: "warn" as const,
  estMonthlyUsd: 0,
  title: `${rule} violation`,
  detail: "ci.yml#on.push: trigger without paths-ignore",
  fix: "apply gated fix",
  autofixable: true,
}));

afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe("plan_fix handler", () => {
  it("returns diffs and writes NOTHING (disk unchanged)", () => {
    const workspaceDir = makeWorkspace();
    const file = path.join(workspaceDir, ".github", "workflows", "ci.yml");
    const before = fs.readFileSync(file, "utf8");

    const res = planFixHandler({ findings: gatedFindings, workspaceDir });
    const sc = res.structuredContent as { results: EngineResult[] };

    expect(sc.results).toHaveLength(1);
    expect(sc.results[0]?.appliedRules).toHaveLength(3);
    expect(fs.readFileSync(file, "utf8")).toBe(before); // dry-run: untouched
  });
});

describe("apply_fix handler", () => {
  it("refuses (throws) when confirmApply is absent", () => {
    const workspaceDir = makeWorkspace();
    const file = path.join(workspaceDir, ".github", "workflows", "ci.yml");
    const before = fs.readFileSync(file, "utf8");

    expect(() => applyFixHandler({ findings: gatedFindings, workspaceDir })).toThrow(/confirmApply/);
    expect(fs.readFileSync(file, "utf8")).toBe(before); // refusal wrote nothing
  });

  it("refuses (throws) when confirmApply is false", () => {
    const workspaceDir = makeWorkspace();
    expect(() =>
      applyFixHandler({ findings: gatedFindings, workspaceDir, confirmApply: false }),
    ).toThrow(/confirmApply/);
  });

  it("with confirmApply:true writes gated fixes and is idempotent on re-run", () => {
    const workspaceDir = makeWorkspace();
    const file = path.join(workspaceDir, ".github", "workflows", "ci.yml");

    const res = applyFixHandler({ findings: gatedFindings, workspaceDir, confirmApply: true });
    const sc = res.structuredContent as { results: EngineResult[]; writtenFiles: string[] };

    expect(sc.results).toHaveLength(1);
    expect(sc.writtenFiles).toHaveLength(1);
    const patched = fs.readFileSync(file, "utf8");
    expect(patched).toContain("paths-ignore");
    expect(patched).toContain("concurrency");
    expect(patched).toContain("timeout-minutes");

    // Idempotent: second apply on the already-patched file is a no-op.
    const res2 = applyFixHandler({ findings: gatedFindings, workspaceDir, confirmApply: true });
    const sc2 = res2.structuredContent as { results: EngineResult[]; writtenFiles: string[] };
    expect(sc2.results).toHaveLength(0);
    expect(sc2.writtenFiles).toHaveLength(0);
  });
});
