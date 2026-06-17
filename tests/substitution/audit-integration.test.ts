import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAudit } from "../../src/orchestrator.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { CostguardConfig } from "../../src/config.js";

// S4 proof: a cross-tool `cheaper-alternative` finding surfaces through a full
// runAudit on a fixture workspace (idle Vercel Pro -> Cloudflare Pages).

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cg-subst-"));
});

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

const config: CostguardConfig = { ...DEFAULT_CONFIG };

describe("runAudit with --substitutions", () => {
  it("emits vercel/cheaper-alternative for a Vercel workspace", async () => {
    const findings = await runAudit({
      selection: [
        { workspace: "site", workspaceDir: dir, entry: { providers: ["vercel"], active: {} } },
      ],
      config,
      flags: { ciOnly: false, cronsOnly: false, substitutions: true },
    });

    const swap = findings.find((f) => f.rule === "vercel/cheaper-alternative");
    expect(swap).toBeDefined();
    expect(swap!.estMonthlyUsd).toBe(20);
    expect(swap!.detail).toMatch(/https?:\/\//); // sourced
  });

  it("does NOT emit substitution findings when the flag is off", async () => {
    const findings = await runAudit({
      selection: [
        { workspace: "site", workspaceDir: dir, entry: { providers: ["vercel"], active: {} } },
      ],
      config,
      flags: { ciOnly: false, cronsOnly: false },
    });
    expect(findings.some((f) => f.rule.endsWith("/cheaper-alternative"))).toBe(false);
  });
});
