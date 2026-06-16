import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../config.js";
import type { EngineResult } from "./types.js";
import type { Finding } from "../types.js";

export function buildPrArtifacts(
  workspace: string,
  results: readonly EngineResult[],
  findings: readonly Finding[],
  now?: Date,
): { branch: string; patch: string; body: string } {
  const date = (now ?? new Date()).toISOString().slice(0, 10);
  const branch = `costguard/fix-${workspace}-${date}`;

  const patch = results.map((r) => r.unifiedDiff).join("\n");

  const allAppliedRules = new Set<string>();
  for (const r of results) {
    for (const rule of r.appliedRules) {
      allAppliedRules.add(rule);
    }
  }

  const fileLines = results.map(
    (r) => `- \`${r.filePath}\`: ${r.appliedRules.join(", ")}`,
  );

  const addressedFindings = findings.filter((f) => allAppliedRules.has(f.rule));
  const findingLines = addressedFindings.map(
    (f) => `- [${f.rule}] ${f.title} — ${f.fix}`,
  );

  const totalSavings = addressedFindings.reduce(
    (sum, f) => sum + f.estMonthlyUsd,
    0,
  );

  const body = [
    `## fix(ci): costguard auto-fixes for ${workspace}`,
    "",
    ...fileLines,
    "",
    "### Findings addressed",
    "",
    ...findingLines,
    "",
    `Estimated savings: $${totalSavings.toFixed(2)}/mo`,
  ].join("\n");

  return { branch, patch, body };
}

export function writePrArtifacts(
  workspace: string,
  artifacts: { branch: string; patch: string; body: string },
  baseDir?: string,
): { dir: string; files: string[] } {
  const dir = path.join(baseDir ?? dataDir(), "pr", workspace);
  fs.mkdirSync(dir, { recursive: true });

  const branchFile = path.join(dir, "branch.txt");
  const patchFile = path.join(dir, "fix.patch");
  const bodyFile = path.join(dir, "pr-body.md");

  fs.writeFileSync(branchFile, artifacts.branch, "utf8");
  fs.writeFileSync(patchFile, artifacts.patch, "utf8");
  fs.writeFileSync(bodyFile, artifacts.body, "utf8");

  return { dir, files: [branchFile, patchFile, bodyFile] };
}

export interface OpenPrResult {
  opened: boolean;
  message: string;
}

export function openPrGated(
  opts: { openPr: boolean },
  env: NodeJS.ProcessEnv,
): OpenPrResult {
  const token = env["GITHUB_TOKEN"];
  if (!opts.openPr || token === undefined || token === "") {
    return {
      opened: false,
      message:
        "--open-pr requires BOTH the --open-pr flag AND a non-empty GITHUB_TOKEN; no branch, commit, or push was performed.",
    };
  }

  // This is the boundary where a future gated, human-authorized push would live;
  // it performs NO git/network action now.
  return {
    opened: false,
    message:
      "Real PR open/push is gated and not enabled in this build (Phase 4 ships dry-run only). No push performed.",
  };
}
