import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Finding } from "../../types.js";
import { loadConfig } from "../../config.js";
import { loadRegistry } from "../../registry/loader.js";
import { resolveSelection, runAudit, totalMonthlyUsd } from "../../orchestrator.js";
import { collectSiteFindings } from "../../checks/site/auditSite.js";
import { auditWorkspaceInputSchema, type FindingsResult } from "../schemas.js";

/**
 * Build the shared findings envelope. `totalMonthlyUsd` and `countsBySeverity`
 * cover COST findings only — the reporter/digest convention: filter
 * `kind !== "diagnostic"` FIRST, then reuse the engine `totalMonthlyUsd` helper
 * (never a re-implemented sum). The full `findings` array (cost + diagnostic, in
 * order) is preserved. Reused by the audit_site adapter.
 */
export function buildFindingsResult(findings: Finding[]): FindingsResult {
  const cost = findings.filter((f) => f.kind !== "diagnostic");
  const countsBySeverity = { info: 0, warn: 0, high: 0 };
  for (const f of cost) countsBySeverity[f.severity] += 1;
  return {
    findings,
    totalMonthlyUsd: totalMonthlyUsd(cost),
    countsBySeverity,
    diagnostics: findings.length - cost.length,
  };
}

/**
 * audit_workspace: wrap the PURE orchestrator. Resolve the selection from the
 * on-disk registry/config, run the engine audit (never the CLI presenter, which
 * writes to stdout and sets exit codes), optionally append read-only site
 * findings, and shape the envelope. No engine logic lives here.
 */
export async function auditWorkspaceHandler(args: unknown): Promise<CallToolResult> {
  const { workspaces = [], all = false, includeSite = false } = auditWorkspaceInputSchema.parse(args);
  const config = loadConfig();
  const registry = loadRegistry();
  const selection = resolveSelection(registry, workspaces, all);
  const findings = await runAudit({
    selection,
    config,
    flags: { ciOnly: false, cronsOnly: false },
  });
  if (includeSite) {
    const targets = selection.map((s) => ({
      workspace: s.workspace,
      site: registry.workspaces[s.workspace]?.site,
    }));
    findings.push(...(await collectSiteFindings(targets)));
  }
  const result = buildFindingsResult(findings);
  return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
}
