import { describe, it, expect } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Packaging guarantee (Maestro S1): a fresh checkout — committed dist/ + knowledge/
// with NO `node_modules` and NO install/build step — runs the skill end-to-end.
// Claude Code / Codex plugin installs copy files only, so the committed
// dist/cli/index.js must be a self-contained bundle. These tests prove that
// against the actually-committed artifact (not a rebuild).
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(repoRoot, "dist", "cli", "index.js");

const WASTEFUL_WORKFLOW = `
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

describe("packaging: committed self-contained dist", () => {
  it("tracks dist/cli/index.js in git so plugin installs receive the built CLI", () => {
    const tracked = execSync("git ls-files dist/cli/index.js", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    expect(tracked).toBe("dist/cli/index.js");
  });

  it("runs `--version` from the committed bundle with no build step", () => {
    const out = execFileSync(process.execPath, [bundle, "--version"], {
      encoding: "utf8",
    });
    expect(out.trim()).toBe("0.1.0");
  });

  it("runs an end-to-end audit from a clean-room copy with NO node_modules", () => {
    // Copy ONLY dist/ + knowledge/ to a temp dir — exactly what a copy-only
    // plugin install ships (no node_modules, no package.json).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cg-pkg-"));
    try {
      fs.cpSync(path.join(repoRoot, "dist"), path.join(tmp, "dist"), { recursive: true });
      fs.cpSync(path.join(repoRoot, "knowledge"), path.join(tmp, "knowledge"), {
        recursive: true,
      });

      const wf = path.join(tmp, "w1", ".github", "workflows");
      fs.mkdirSync(wf, { recursive: true });
      fs.writeFileSync(path.join(wf, "ci.yml"), WASTEFUL_WORKFLOW, "utf8");
      fs.writeFileSync(
        path.join(tmp, "workspaces.json"),
        JSON.stringify({ root: tmp, workspaces: { w1: { providers: [], active: {} } } }),
        "utf8",
      );

      let stdout = "";
      let code = 0;
      try {
        stdout = execFileSync(
          process.execPath,
          [path.join(tmp, "dist", "cli", "index.js"), "audit", "w1", "--json"],
          { cwd: tmp, encoding: "utf8" },
        );
      } catch (err) {
        // audit exits 1 when a high-severity finding exists — still success.
        const e = err as { status?: number; stdout?: string };
        code = e.status ?? 1;
        stdout = e.stdout ?? "";
      }

      expect([0, 1]).toContain(code);
      const report = JSON.parse(stdout) as { findings: unknown[]; totalMonthlyUsd: number };
      expect(Array.isArray(report.findings)).toBe(true);
      expect(report.findings.length).toBeGreaterThan(0);
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        // best-effort temp cleanup
      }
    }
  });
});
