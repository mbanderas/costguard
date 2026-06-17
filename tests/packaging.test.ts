import { describe, it, expect } from "vitest";
import { execFileSync, execSync, spawn } from "node:child_process";
import http from "node:http";
import { Buffer } from "node:buffer";
import type { AddressInfo } from "node:net";
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

  it("has no dead tsconfig.build.json (build is esbuild via scripts/bundle.mjs)", () => {
    expect(fs.existsSync(path.join(repoRoot, "tsconfig.build.json"))).toBe(false);
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

  it("runs `site --json` from a clean-room copy against a local fixture (R14 + G1)", async () => {
    // Same copy-only install shape, exercising the `site` command end-to-end and
    // proving the no-double-count cost math holds in the SHIPPED bundle. Uses async
    // spawn (not execFileSync) because the fixture server shares this event loop —
    // a synchronous child would deadlock its own fetches.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cg-site-"));
    const server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/") {
        res.setHeader("x-vercel-id", "t"); // billed host (Vercel)
        res.setHeader("content-type", "text/html");
        res.end(
          `<!doctype html><html><head><script src="/app.js"></script></head>` +
            `<body><img src="/big.jpg"></body></html>`,
        );
      } else if (url === "/big.jpg") {
        res.setHeader("content-type", "image/jpeg");
        res.end(Buffer.alloc(700_000, 1)); // oversized image
      } else if (url === "/app.js") {
        res.setHeader("content-type", "application/javascript");
        res.end(Buffer.alloc(400_000, 97)); // large uncompressed JS
      } else {
        res.statusCode = 404;
        res.end("no");
      }
    });
    try {
      fs.cpSync(path.join(repoRoot, "dist"), path.join(tmp, "dist"), { recursive: true });
      fs.cpSync(path.join(repoRoot, "knowledge"), path.join(tmp, "knowledge"), { recursive: true });
      const port = await new Promise<number>((resolve) =>
        server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
      );
      const { stdout, code } = await new Promise<{ stdout: string; code: number }>((resolve) => {
        const child = spawn(
          process.execPath,
          [path.join(tmp, "dist", "cli", "index.js"), "site", `http://127.0.0.1:${port}/`, "--json"],
          { cwd: tmp }, // NO node_modules — bundle must be self-contained
        );
        let out = "";
        child.stdout.on("data", (d: Buffer) => (out += d.toString()));
        child.on("close", (c) => resolve({ stdout: out, code: c ?? 0 }));
      });

      expect([0, 1]).toContain(code);
      const report = JSON.parse(stdout) as {
        findings: { rule: string; estMonthlyUsd: number; detail: string }[];
        totalMonthlyUsd: number;
      };
      const transfer = report.findings.find((f) => f.rule === "site/transfer-weight")!;
      const image = report.findings.find((f) => f.rule === "site/oversized-image")!;
      // G1 end-to-end on the shipped bundle: headline == the sole transfer cost line
      expect(report.totalMonthlyUsd).toBeCloseTo(transfer.estMonthlyUsd, 9);
      expect(image.estMonthlyUsd).toBe(0);
      expect(image.detail).toMatch(/\$/);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        // best-effort temp cleanup
      }
    }
  });
});
