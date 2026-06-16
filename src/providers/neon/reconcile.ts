import type { Finding } from "../../types.js";
import type { CostguardConfig } from "../../config.js";
import type { NeonActive } from "./types.js";
import { computeOverageCost } from "./pricing.js";

export interface ReconcileNeonArgs {
  projects: Array<{ id: string; name: string }>;
  branchesByProject: Record<string, Array<{ id: string; name: string; isDefault: boolean }>>;
  computeHoursByProject: Record<string, number>;
  active: NeonActive;
  config: CostguardConfig;
  workspace: string;
}

export function reconcileNeon(args: ReconcileNeonArgs): Finding[] {
  const {
    projects,
    branchesByProject,
    computeHoursByProject,
    active,
    config,
    workspace,
  } = args;

  const { neonFreeComputeHoursPerMonth, neonComputeHourlyRate, neonBranchComputeMonthly } =
    config.defaults;

  const declaredSet = new Set(active.projects);
  const declaredBranches = new Set(active.branches ?? []);
  const findings: Finding[] = [];

  for (const project of projects) {
    const isDeclared = declaredSet.has(project.id) || declaredSet.has(project.name);

    if (!isDeclared) {
      findings.push({
        workspace,
        provider: "neon",
        rule: "neon/orphaned-project",
        severity: "high",
        estMonthlyUsd: neonBranchComputeMonthly,
        title: `Orphaned Neon project: ${project.id}`,
        detail: `Project "${project.id}" (${project.name}) is live but not declared in active.neon.projects.`,
        fix: "Confirm this Neon project is needed; delete it or add to workspaces.json active.neon.projects.",
        autofixable: false,
      });
      continue;
    }

    // Declared + live: check idle branches
    const branches = branchesByProject[project.id] ?? [];
    for (const branch of branches) {
      if (!branch.isDefault && !declaredBranches.has(branch.name)) {
        findings.push({
          workspace,
          provider: "neon",
          rule: "neon/idle-branch",
          severity: "warn",
          estMonthlyUsd: neonBranchComputeMonthly,
          title: `Idle Neon branch: ${branch.name} (${project.id})`,
          detail: `Branch "${branch.name}" on project "${project.id}" is not default and not declared in active.neon.branches.`,
          fix: `Delete idle preview branch "${branch.name}" in the Neon console, or add it to active.neon.branches.`,
          autofixable: false,
        });
      }
    }

    // Check compute overage
    const usedHours = computeHoursByProject[project.id] ?? 0;
    if (usedHours > neonFreeComputeHoursPerMonth) {
      const est = computeOverageCost(usedHours, neonFreeComputeHoursPerMonth, neonComputeHourlyRate);
      findings.push({
        workspace,
        provider: "neon",
        rule: "neon/compute-overage",
        severity: "warn",
        estMonthlyUsd: est,
        title: `Neon compute overage: ${project.id}`,
        detail: `Project "${project.id}" used ${usedHours.toFixed(1)}h this period; free tier is ${neonFreeComputeHoursPerMonth}h.`,
        fix: `Review compute usage for project "${project.id}". Consider scaling down compute size or suspending idle branches.`,
        autofixable: false,
      });
    }
  }

  findings.sort((a, b) => {
    const ruleOrder = a.rule.localeCompare(b.rule);
    if (ruleOrder !== 0) return ruleOrder;
    return a.title.localeCompare(b.title);
  });

  return findings;
}
