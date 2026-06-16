import type { Finding } from "../types.js";
import { totalMonthlyUsd } from "../orchestrator.js";

// ---------------------------------------------------------------------------
// Severity ordering for tie-breaks
// ---------------------------------------------------------------------------

function severityRank(s: Finding["severity"]): number {
  if (s === "high") return 2;
  if (s === "warn") return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// sortFindings
// ---------------------------------------------------------------------------

/**
 * Returns a new array of findings sorted by:
 * 1. estMonthlyUsd DESC
 * 2. severity DESC (high > warn > info)
 * 3. rule ASC
 * Does not mutate the input.
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (b.estMonthlyUsd !== a.estMonthlyUsd) {
      return b.estMonthlyUsd - a.estMonthlyUsd;
    }
    const sevDiff = severityRank(b.severity) - severityRank(a.severity);
    if (sevDiff !== 0) return sevDiff;
    return a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// renderMarkdown
// ---------------------------------------------------------------------------

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}/mo`;
}

function severityBadge(s: Finding["severity"]): string {
  return `[${s.toUpperCase()}]`;
}

function renderFinding(f: Finding): string {
  const lines: string[] = [
    `#### ${severityBadge(f.severity)} \`${f.rule}\` — ${formatUsd(f.estMonthlyUsd)}`,
    `**${f.title}**`,
    ``,
    `_Detail:_ ${f.detail}`,
    ``,
    `_Fix:_ ${f.fix}`,
  ];
  return lines.join("\n");
}

/**
 * Render findings as plain Markdown (no ANSI/color).
 * Workspaces grouped by subtotal $ desc; findings within each group by $ desc.
 * Empty findings → clean "No findings" report.
 */
export function renderMarkdown(
  findings: Finding[],
  meta: { generatedAt: string },
): string {
  const grand = totalMonthlyUsd(findings);
  const sections: string[] = [];

  sections.push(`# CostGuard Audit Report`);
  sections.push(``);
  sections.push(`Generated: ${meta.generatedAt}`);
  sections.push(``);
  sections.push(`**Total estimated waste: ${formatUsd(grand)}**`);
  sections.push(``);

  if (findings.length === 0) {
    sections.push(`No findings — all checks passed.`);
    return sections.join("\n");
  }

  // Group by workspace
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const group = groups.get(f.workspace) ?? [];
    group.push(f);
    groups.set(f.workspace, group);
  }

  // Sort groups by subtotal desc
  const sortedGroups = [...groups.entries()].sort(([, aFindings], [, bFindings]) => {
    const aTotal = totalMonthlyUsd(aFindings);
    const bTotal = totalMonthlyUsd(bFindings);
    return bTotal - aTotal;
  });

  for (const [workspace, wsFindings] of sortedGroups) {
    const subtotal = totalMonthlyUsd(wsFindings);
    sections.push(`## Workspace: ${workspace} (${formatUsd(subtotal)})`);
    sections.push(``);

    const sorted = sortFindings(wsFindings);
    for (const f of sorted) {
      sections.push(renderFinding(f));
      sections.push(``);
    }
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// renderJson
// ---------------------------------------------------------------------------

/**
 * Render findings as a JSON string with:
 * { generatedAt, totalMonthlyUsd, findings: sorted[] }
 */
export function renderJson(
  findings: Finding[],
  meta: { generatedAt: string },
): string {
  const sorted = sortFindings(findings);
  return JSON.stringify(
    {
      generatedAt: meta.generatedAt,
      totalMonthlyUsd: totalMonthlyUsd(findings),
      findings: sorted,
    },
    null,
    2,
  );
}
