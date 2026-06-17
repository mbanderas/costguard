import type { Finding } from "../types.js";
import {
  loadSubstitutions,
  type SubstitutionClass,
  type SubstitutionTool,
} from "./matrix.js";

/**
 * Emit `<provider>/cheaper-alternative` findings for a workspace's observed
 * tools. For each equivalence class, if the workspace uses a tool that is
 * materially pricier than the cheapest capability-equal tool in the same class,
 * suggest the swap. Every $ delta comes from a sourced knowledge fact (the
 * source URL is included in the finding) — never hardcoded, never fabricated.
 * Cross-capability swaps are impossible by construction: classes only ever
 * contain 1:1-equivalent tools (R13 non-substitutes live in separate classes).
 */
export function substitutionFindings(workspace: string, providers: readonly string[]): Finding[] {
  const matrix = loadSubstitutions();
  const have = new Set(providers);
  const findings: Finding[] = [];

  for (const cls of matrix.classes) {
    const cheapest = [...cls.tools].sort((a, b) => a.baseMonthlyUsd - b.baseMonthlyUsd)[0];
    if (cheapest === undefined) continue;

    for (const tool of cls.tools) {
      if (!have.has(tool.provider)) continue;
      if (tool.provider === cheapest.provider) continue;
      const savings = tool.baseMonthlyUsd - cheapest.baseMonthlyUsd;
      if (savings < matrix.minMaterialSavingsUsd) continue;
      findings.push(buildFinding(workspace, cls, tool, cheapest, savings));
    }
  }

  return findings;
}

function buildFinding(
  workspace: string,
  cls: SubstitutionClass,
  from: SubstitutionTool,
  to: SubstitutionTool,
  savings: number,
): Finding {
  const detail =
    `Same capability (${cls.capability}) is available on ${to.provider} (${to.plan}) for ` +
    `$${to.baseMonthlyUsd.toFixed(2)}/mo vs ${from.provider} (${from.plan}) at ` +
    `$${from.baseMonthlyUsd.toFixed(2)}/mo — est. save $${savings.toFixed(2)}/mo if this workspace's ` +
    `workload fits the class. Migration effort: ${from.migration}. Lock-in: ${to.lockIn} ` +
    `Sources: ${from.source.url} ; ${to.source.url}`;

  return {
    workspace,
    provider: from.provider,
    rule: `${from.provider}/cheaper-alternative`,
    severity: savings >= 15 ? "warn" : "info",
    estMonthlyUsd: savings,
    title: `Cheaper ${cls.id} alternative: ${from.provider} -> ${to.provider} (~$${savings.toFixed(0)}/mo)`,
    detail,
    fix: `Evaluate moving ${cls.id} from ${from.provider} (${from.plan}) to ${to.provider} (${to.plan}); confirm the workload is ${cls.id} before switching.`,
    autofixable: false,
  };
}
