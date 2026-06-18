import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildPrArtifacts,
  writePrArtifacts,
  openPrGated,
} from "../src/fix/pr.js";
import type { EngineResult } from "../src/fix/types.js";
import type { Finding } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2025-03-15T12:00:00.000Z");

const result1: EngineResult = {
  filePath: ".github/workflows/ci.yml",
  original: "on: push",
  patched: "on:\n  push:\n    branches: [main]",
  unifiedDiff: "--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@ -1 +1,3 @@\n-on: push\n+on:\n+  push:\n+    branches: [main]",
  appliedRules: ["ci/double-trigger", "ci/no-cache"],
};

const result2: EngineResult = {
  filePath: ".github/workflows/deploy.yml",
  original: "cache: false",
  patched: "cache: true",
  unifiedDiff: "--- a/.github/workflows/deploy.yml\n+++ b/.github/workflows/deploy.yml\n@@ -1 +1 @@\n-cache: false\n+cache: true",
  appliedRules: ["ci/no-cache"],
};

const finding1: Finding = {
  workspace: "myws",
  provider: "ci",
  rule: "ci/double-trigger",
  severity: "high",
  estMonthlyUsd: 3.0,
  title: "Double trigger detected",
  detail: ".github/workflows/ci.yml:1",
  fix: "Remove duplicate push trigger",
  autofixable: true,
};

const finding2: Finding = {
  workspace: "myws",
  provider: "ci",
  rule: "ci/no-cache",
  severity: "warn",
  estMonthlyUsd: 0,
  title: "No cache configured",
  detail: ".github/workflows/ci.yml:3",
  fix: "Add cache step for dependencies",
  autofixable: true,
};

const finding3: Finding = {
  workspace: "myws",
  provider: "ci",
  rule: "ci/unrelated",
  severity: "info",
  estMonthlyUsd: 10.0,
  title: "Unrelated finding",
  detail: "some file",
  fix: "Do something",
  autofixable: false,
};

// ---------------------------------------------------------------------------
// buildPrArtifacts
// ---------------------------------------------------------------------------

describe("buildPrArtifacts", () => {
  it("branch matches pattern with fixed date", () => {
    const { branch } = buildPrArtifacts("myws", [result1], [finding1], FIXED_NOW);
    expect(branch).toMatch(/^costguard\/fix-myws-\d{4}-\d{2}-\d{2}$/);
    expect(branch).toBe("costguard/fix-myws-2025-03-15");
  });

  it("patch joins all unifiedDiffs", () => {
    const { patch } = buildPrArtifacts("myws", [result1, result2], [], FIXED_NOW);
    expect(patch).toContain(result1.unifiedDiff);
    expect(patch).toContain(result2.unifiedDiff);
  });

  it("body contains rule ids from appliedRules", () => {
    const { body } = buildPrArtifacts("myws", [result1], [finding1, finding2], FIXED_NOW);
    expect(body).toContain("ci/double-trigger");
    expect(body).toContain("ci/no-cache");
  });

  it("body contains addressed finding fix strings", () => {
    const { body } = buildPrArtifacts("myws", [result1], [finding1, finding2], FIXED_NOW);
    expect(body).toContain("Remove duplicate push trigger");
    expect(body).toContain("Add cache step for dependencies");
  });

  it("body sums estMonthlyUsd for addressed findings only", () => {
    // finding1 = $3.00, finding2 = $0, finding3 not in appliedRules
    const { body } = buildPrArtifacts(
      "myws",
      [result1],
      [finding1, finding2, finding3],
      FIXED_NOW,
    );
    expect(body).toContain("$3.00/mo");
    // finding3 (ci/unrelated) is NOT in appliedRules => not counted
    expect(body).not.toContain("$13.00");
  });

  it("body contains savings with two decimal places", () => {
    const { body } = buildPrArtifacts("myws", [result1, result2], [finding1, finding2], FIXED_NOW);
    expect(body).toContain("Estimated savings: $3.00/mo");
  });

  it("body title includes workspace", () => {
    const { body } = buildPrArtifacts("myws", [], [], FIXED_NOW);
    expect(body).toContain("## fix(ci): costguard auto-fixes for myws");
  });

  it("unrelated findings are excluded from body", () => {
    const { body } = buildPrArtifacts("myws", [result1], [finding3], FIXED_NOW);
    expect(body).not.toContain("Unrelated finding");
    expect(body).toContain("$0.00/mo");
  });
});

// ---------------------------------------------------------------------------
// writePrArtifacts
// ---------------------------------------------------------------------------

describe("writePrArtifacts", () => {
  it("writes branch.txt, fix.patch, pr-body.md under the given baseDir", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "costguard-test-"));
    try {
      const artifacts = {
        branch: "costguard/fix-myws-2025-03-15",
        patch: "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new",
        body: "## fix(ci): costguard auto-fixes for myws\n\nEstimated savings: $3.00/mo",
      };

      const { dir, files } = writePrArtifacts("myws", artifacts, tmpBase);

      expect(dir).toBe(path.join(tmpBase, "pr", "myws"));
      expect(files).toHaveLength(3);

      const [branchFile, patchFile, bodyFile] = files;
      expect(branchFile).toBeDefined();
      expect(patchFile).toBeDefined();
      expect(bodyFile).toBeDefined();

      expect(fs.existsSync(branchFile!)).toBe(true);
      expect(fs.existsSync(patchFile!)).toBe(true);
      expect(fs.existsSync(bodyFile!)).toBe(true);

      expect(fs.readFileSync(branchFile!, "utf8")).toBe(artifacts.branch);
      expect(fs.readFileSync(patchFile!, "utf8")).toBe(artifacts.patch);
      expect(fs.readFileSync(bodyFile!, "utf8")).toBe(artifacts.body);
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("only writes under baseDir, not elsewhere", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "costguard-test-"));
    try {
      const artifacts = { branch: "b", patch: "p", body: "bd" };
      const { dir } = writePrArtifacts("ws", artifacts, tmpBase);
      expect(dir.startsWith(tmpBase)).toBe(true);
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// openPrGated — opened is ALWAYS false
// ---------------------------------------------------------------------------

describe("openPrGated", () => {
  it("returns opened:false when openPr is false and no token", () => {
    const result = openPrGated({ openPr: false }, {});
    expect(result.opened).toBe(false);
    expect(result.message).toMatch(/requires/i);
  });

  it("returns opened:false when openPr is true but no token", () => {
    const result = openPrGated({ openPr: true }, {});
    expect(result.opened).toBe(false);
  });

  it("returns opened:false when openPr is false even with token", () => {
    const result = openPrGated({ openPr: false }, { GITHUB_TOKEN: "t" });
    expect(result.opened).toBe(false);
    expect(result.message).toMatch(/requires/i);
  });

  it("returns opened:false (inert stub) when openPr is true and token present", () => {
    const result = openPrGated({ openPr: true }, { GITHUB_TOKEN: "test-github-token" });
    expect(result.opened).toBe(false);
    expect(result.message).toMatch(/gated|not enabled/i);
  });

  it("never returns opened:true in any scenario", () => {
    const scenarios: Array<[{ openPr: boolean }, NodeJS.ProcessEnv]> = [
      [{ openPr: false }, {}],
      [{ openPr: true }, {}],
      [{ openPr: false }, { GITHUB_TOKEN: "x" }],
      [{ openPr: true }, { GITHUB_TOKEN: "x" }],
      [{ openPr: true }, { GITHUB_TOKEN: "" }],
    ];
    for (const [opts, env] of scenarios) {
      expect(openPrGated(opts, env).opened).toBe(false);
    }
  });
});
