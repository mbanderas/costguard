import type { AuditFlags } from "../../orchestrator.js";

export interface AuditAndReportOptions {
  workspaces: string[];
  all: boolean;
  flags: AuditFlags;
  format?: "markdown" | "json";
}

/**
 * Shared core: resolve, audit, persist, render.
 * Used by both `audit` and `scan` commands.
 * Heavy modules (orchestrator, checks) are dynamically imported so that
 * commands which don't need them (registry, report) don't pay the load cost.
 */
export async function runAuditAndReport(opts: AuditAndReportOptions): Promise<void> {
  const { workspaces, all, flags, format = "markdown" } = opts;

  if (workspaces.length === 0 && !all) {
    console.error("Error: specify workspaces or --all");
    process.exitCode = 1;
    return;
  }

  const [
    { loadConfig },
    { loadRegistry },
    { resolveSelection, runAudit, hasHighFinding, totalMonthlyUsd },
    { saveRun },
    { renderMarkdown, renderJson },
  ] = await Promise.all([
    import("../../config.js"),
    import("../../registry/loader.js"),
    import("../../orchestrator.js"),
    import("../../reporter/persist.js"),
    import("../../reporter/index.js"),
  ]);

  const config = loadConfig();
  const registry = loadRegistry();
  const selection = resolveSelection(registry, workspaces, all);
  const findings = await runAudit({ selection, config, flags });
  const run = saveRun(findings);

  const total = totalMonthlyUsd(findings);
  console.error(
    `${findings.length} finding(s) across ${selection.length} workspace(s) — est. $${total.toFixed(2)}/mo`,
  );

  const output =
    format === "json"
      ? renderJson(findings, { generatedAt: run.generatedAt })
      : renderMarkdown(findings, { generatedAt: run.generatedAt });

  console.log(output);

  if (hasHighFinding(findings)) {
    process.exitCode = 1;
  }
}
