import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// The `costguard install` subcommand is a thin pass-through to
// scripts/install.cjs. It exists for npm/portable users (the plugin path copies
// dist/+knowledge/ only). These tests run against the REPO CHECKOUT — where
// scripts/install.cjs is present beside dist/ — NOT a clean-room/dist-only copy.
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(repoRoot, "dist", "cli", "index.js");

function runCli(args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync(process.execPath, [bundle, ...args], {
      encoding: "utf8",
    });
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { stdout: e.stdout ?? "", code: e.status ?? 1 };
  }
}

describe("cli: install subcommand (pass-through to scripts/install.cjs)", () => {
  it("forwards a --dry-run plan to the installer", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cg-install-"));
    try {
      const { stdout, code } = runCli([
        "install",
        "--target",
        "cursor",
        "--project",
        tmp,
        "--dry-run",
      ]);
      expect(code).toBe(0);
      const norm = stdout.replace(/\\/g, "/");
      expect(norm).toContain("would create");
      expect(norm).toContain(".cursor/commands/costguard.md");
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        // best-effort temp cleanup
      }
    }
  });

  it("exits 1 on an unknown --target", () => {
    const { code } = runCli(["install", "--target", "bogus"]);
    expect(code).toBe(1);
  });

  it("forwards the installer HELP text through --help", () => {
    const { stdout, code } = runCli(["install", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Costguard portable installer");
  });

  it("lists `install` in the top-level --help", () => {
    const { stdout, code } = runCli(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("install");
  });
});
