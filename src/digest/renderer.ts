import type { Finding } from "../types.js";
import { totalMonthlyUsd } from "../orchestrator.js";
import { sortFindings } from "../reporter/index.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fmtUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

interface ProviderRow {
  provider: string;
  count: number;
  total: number;
}

function buildProviderRows(findings: Finding[]): ProviderRow[] {
  const map = new Map<string, ProviderRow>();
  for (const f of findings) {
    const row = map.get(f.provider) ?? { provider: f.provider, count: 0, total: 0 };
    map.set(f.provider, { ...row, count: row.count + 1, total: row.total + f.estMonthlyUsd });
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// renderDigestMarkdown
// ---------------------------------------------------------------------------

export function renderDigestMarkdown(
  findings: Finding[],
  meta: { generatedAt: string; period: string },
): string {
  const total = totalMonthlyUsd(findings);
  const highCount = findings.filter((f) => f.severity === "high").length;
  const providerRows = buildProviderRows(findings);
  const topFindings = sortFindings(findings).slice(0, 5);

  const lines: string[] = [];

  // Header
  lines.push(`# CostGuard Monthly Digest — ${meta.period}`);
  lines.push(`Generated: ${meta.generatedAt}`);
  lines.push(``);

  // Summary
  lines.push(
    `**Total: ${fmtUsd(total)}/mo across ${findings.length} finding(s) — ${highCount} high.**`,
  );
  lines.push(``);

  // By provider table
  lines.push(`## By provider`);
  lines.push(`| Provider | Findings | Est. $/mo |`);
  lines.push(`| --- | --- | --- |`);
  for (const row of providerRows) {
    lines.push(`| ${row.provider} | ${row.count} | ${fmtUsd(row.total)} |`);
  }
  lines.push(``);

  // Top findings table
  lines.push(`## Top findings`);
  lines.push(`| Workspace | Rule | Est. $/mo |`);
  lines.push(`| --- | --- | --- |`);
  for (const f of topFindings) {
    lines.push(`| ${f.workspace} | ${f.rule} | ${fmtUsd(f.estMonthlyUsd)} |`);
  }
  lines.push(``);

  // Footer
  lines.push(`Run \`costguard report --last\` for the full report.`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// renderDigestJson
// ---------------------------------------------------------------------------

export function renderDigestJson(
  findings: Finding[],
  meta: { generatedAt: string; period: string },
): string {
  const total = totalMonthlyUsd(findings);
  const highCount = findings.filter((f) => f.severity === "high").length;
  const providerBreakdown = buildProviderRows(findings);
  const topFindings = sortFindings(findings).slice(0, 5);

  return JSON.stringify(
    {
      period: meta.period,
      generatedAt: meta.generatedAt,
      totalMonthlyUsd: total,
      highCount,
      providerBreakdown,
      topFindings,
    },
    null,
    2,
  );
}
