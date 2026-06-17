import { analyzeSite } from "../../checks/site/analyze.js";

export interface SiteOptions {
  url: string;
  json: boolean;
}

/**
 * Run read-only live-site cost checks on a single URL and render the report.
 * GET-only / no browser (see analyzeSite). Heavy reporter/orchestrator helpers
 * are loaded lazily, matching the audit command.
 */
export async function runSite(opts: SiteOptions): Promise<void> {
  let findings;
  try {
    findings = await analyzeSite(opts.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: could not analyze ${opts.url}: ${msg}`);
    process.exitCode = 1;
    return;
  }

  const [{ renderJson, renderMarkdown }, { totalMonthlyUsd, hasHighFinding }] = await Promise.all([
    import("../../reporter/index.js"),
    import("../../orchestrator.js"),
  ]);

  const generatedAt = new Date().toISOString();
  const total = totalMonthlyUsd(findings);
  console.error(
    `${findings.length} site finding(s) for ${opts.url} — est. $${total.toFixed(2)}/mo`,
  );

  const output = opts.json
    ? renderJson(findings, { generatedAt })
    : renderMarkdown(findings, { generatedAt });
  console.log(output);

  if (hasHighFinding(findings)) {
    process.exitCode = 1;
  }
}
