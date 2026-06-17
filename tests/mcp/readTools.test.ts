import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { Finding } from "../../src/types.js";

// audit_site's engine fn is mocked so the test never touches the network. This
// also stubs the import audit_workspace holds, but includeSite is left off there.
vi.mock("../../src/checks/site/auditSite.js", () => ({ collectSiteFindings: vi.fn() }));
import { collectSiteFindings } from "../../src/checks/site/auditSite.js";

import { buildFindingsResult, auditWorkspaceHandler } from "../../src/mcp/tools/auditWorkspace.js";
import { discoverProvidersHandler } from "../../src/mcp/tools/discoverProviders.js";
import { auditSiteHandler } from "../../src/mcp/tools/auditSite.js";

const mockedCollect = vi.mocked(collectSiteFindings);

const base: Finding = {
  workspace: "w",
  provider: "ci",
  rule: "ci/x",
  severity: "warn",
  estMonthlyUsd: 0,
  title: "t",
  detail: "d",
  fix: "f",
  autofixable: false,
};

// ---------------------------------------------------------------------------
// buildFindingsResult — the envelope logic (diagnostic exclusion)
// ---------------------------------------------------------------------------

describe("buildFindingsResult", () => {
  it("totals and counts COST findings only; a diagnostic with nonzero estMonthlyUsd is excluded", () => {
    const findings: Finding[] = [
      { ...base, severity: "high", estMonthlyUsd: 10 },
      { ...base, severity: "warn", estMonthlyUsd: 5 },
      { ...base, severity: "high", estMonthlyUsd: 99, kind: "diagnostic" },
    ];
    const r = buildFindingsResult(findings);
    expect(r.totalMonthlyUsd).toBeCloseTo(15, 5);
    expect(r.countsBySeverity).toEqual({ info: 0, warn: 1, high: 1 });
    expect(r.diagnostics).toBe(1);
    expect(r.findings).toHaveLength(3); // full array preserved, in order
  });

  it("empty findings -> zeroed envelope", () => {
    const r = buildFindingsResult([]);
    expect(r).toEqual({
      findings: [],
      totalMonthlyUsd: 0,
      countsBySeverity: { info: 0, warn: 0, high: 0 },
      diagnostics: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// discover_providers — env-var NAMES only, never values
// ---------------------------------------------------------------------------

describe("discover_providers handler", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cg-disc-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("detects a provider and returns env-var NAMES without leaking values", () => {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2" } }),
    );
    fs.writeFileSync(path.join(dir, ".env"), "SUPABASE_SERVICE_ROLE_KEY=super-secret-value-123\n");

    const res = discoverProvidersHandler({ dir });
    const sc = res.structuredContent as { detections: Array<{ id: string; envVars: string[] }> };
    const supa = sc.detections.find((d) => d.id === "supabase");

    expect(supa).toBeDefined();
    expect(supa?.envVars).toContain("SUPABASE_SERVICE_ROLE_KEY"); // NAME surfaced
    // The secret VALUE must never appear anywhere in the serialized result.
    expect(JSON.stringify(res)).not.toContain("super-secret-value-123");
  });

  it("rejects input missing dir", () => {
    expect(() => discoverProvidersHandler({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// audit_workspace — real engine over a temp registry/workspace (no mocks)
// ---------------------------------------------------------------------------

describe("audit_workspace handler", () => {
  let root: string;
  let cwd: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cg-aw-"));
    const wf = path.join(root, "w1", ".github", "workflows");
    fs.mkdirSync(wf, { recursive: true });
    fs.writeFileSync(
      path.join(wf, "ci.yml"),
      "name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
    );
    fs.writeFileSync(
      path.join(root, "workspaces.json"),
      JSON.stringify({ root, workspaces: { w1: { providers: [], active: {} } } }),
    );
    cwd = process.cwd();
    process.chdir(root); // loadRegistry/loadConfig resolve relative to cwd
  });
  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns a Findings envelope from the pure orchestrator", async () => {
    const res = await auditWorkspaceHandler({ workspaces: ["w1"] });
    const sc = res.structuredContent as {
      findings: Finding[];
      totalMonthlyUsd: number;
      diagnostics: number;
    };
    expect(sc.findings.length).toBeGreaterThan(0);
    expect(sc.findings.every((f) => f.workspace === "w1")).toBe(true);
    expect(typeof sc.totalMonthlyUsd).toBe("number");
    expect(mockedCollect).not.toHaveBeenCalled(); // includeSite off -> no site call
  });
});

// ---------------------------------------------------------------------------
// audit_site — thin wrapper over the (mocked) site engine fn
// ---------------------------------------------------------------------------

describe("audit_site handler", () => {
  beforeEach(() => {
    mockedCollect.mockReset();
  });

  it("maps urls to targets and builds an envelope from the engine findings", async () => {
    mockedCollect.mockResolvedValue([{ ...base, provider: "site", estMonthlyUsd: 7 }]);
    const res = await auditSiteHandler({ urls: ["https://example.com"] });

    expect(mockedCollect).toHaveBeenCalledWith([{ workspace: "url-0", site: "https://example.com" }]);
    const sc = res.structuredContent as { totalMonthlyUsd: number; findings: Finding[] };
    expect(sc.totalMonthlyUsd).toBeCloseTo(7, 5);
    expect(sc.findings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// source invariant — no CLI presenter / stdout writes anywhere under src/mcp
// (load-bearing: the MCP surface must never reach a CLI presenter or stdout)
// ---------------------------------------------------------------------------

describe("src/mcp source invariants", () => {
  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...tsFiles(p));
      else if (e.name.endsWith(".ts")) out.push(p);
    }
    return out;
  }

  it("contains no runAuditAndReport reference and no console.* usage", () => {
    const mcpDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "mcp");
    const offenders: string[] = [];
    for (const file of tsFiles(mcpDir)) {
      const src = fs.readFileSync(file, "utf8");
      if (src.includes("runAuditAndReport")) offenders.push(`${file}: runAuditAndReport`);
      if (/\bconsole\s*\./.test(src)) offenders.push(`${file}: console.`);
    }
    expect(offenders).toEqual([]);
  });
});
