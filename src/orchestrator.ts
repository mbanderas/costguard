import path from "node:path";
import type { Finding } from "./types.js";
import type { WorkspaceRegistry } from "./registry/schema.js";
import type { CostguardConfig } from "./config.js";
import { resolveWorkspaceConfig } from "./config.js";
import { resolvedRoot } from "./registry/loader.js";
import { ciCheck } from "./checks/ci/index.js";
import { cronCheck } from "./checks/cron/index.js";

export interface AuditFlags {
  ciOnly: boolean;
  cronsOnly: boolean;
}

export interface SelectedWorkspace {
  workspace: string;
  workspaceDir: string;
}

/**
 * Resolve the set of workspaces to audit.
 * - all=true: every entry in the registry.
 * - all=false: only the named entries; throws if any name is missing.
 */
export function resolveSelection(
  registry: WorkspaceRegistry,
  names: string[],
  all: boolean,
): SelectedWorkspace[] {
  const root = resolvedRoot(registry);

  if (all) {
    return Object.keys(registry.workspaces).map((name) => ({
      workspace: name,
      workspaceDir: path.join(root, name),
    }));
  }

  const missing = names.filter((n) => !(n in registry.workspaces));
  if (missing.length > 0) {
    throw new Error(
      `Workspace(s) not found in registry: ${missing.join(", ")}`,
    );
  }

  return names.map((name) => ({
    workspace: name,
    workspaceDir: path.join(root, name),
  }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeCheckErrorFinding(
  workspace: string,
  provider: string,
  err: unknown,
): Finding {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    workspace,
    provider,
    rule: `${provider}/check-error`,
    severity: "warn",
    estMonthlyUsd: 0,
    title: `Check error in ${provider}`,
    detail: msg,
    fix: `Investigate the ${provider} check failure; run costguard with --verbose for more detail.`,
    autofixable: false,
  };
}

// ---------------------------------------------------------------------------
// runAudit
// ---------------------------------------------------------------------------

/**
 * Run enabled checks across the selected workspaces.
 * Per-(workspace, check) errors are caught and surfaced as "*\/check-error"
 * findings so a single bad workspace never aborts the full run.
 */
export async function runAudit(args: {
  selection: SelectedWorkspace[];
  config: CostguardConfig;
  flags: AuditFlags;
}): Promise<Finding[]> {
  const { selection, config, flags } = args;
  const allFindings: Finding[] = [];

  for (const { workspace, workspaceDir } of selection) {
    const resolvedConfig = resolveWorkspaceConfig(config, workspace);
    const ctx = { workspace, workspaceDir, config: resolvedConfig };

    if (!flags.cronsOnly) {
      try {
        const found = await ciCheck(ctx);
        allFindings.push(...found);
      } catch (err) {
        allFindings.push(makeCheckErrorFinding(workspace, "ci", err));
      }
    }

    if (!flags.ciOnly) {
      try {
        const found = await cronCheck(ctx);
        allFindings.push(...found);
      } catch (err) {
        allFindings.push(makeCheckErrorFinding(workspace, "cron", err));
      }
    }
  }

  return allFindings;
}

// ---------------------------------------------------------------------------
// Aggregate utilities
// ---------------------------------------------------------------------------

export function hasHighFinding(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === "high");
}

export function totalMonthlyUsd(findings: Finding[]): number {
  return findings.reduce((sum, f) => sum + f.estMonthlyUsd, 0);
}

