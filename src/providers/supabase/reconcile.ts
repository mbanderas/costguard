import type { Finding } from "../../types.js";
import type { CostguardConfig } from "../../config.js";
import type { SupabaseActive } from "./types.js";
import type { NormalizedProject, NormalizedBranch, NormalizedCompute } from "./api.js";
import { monthlyUsdForTier, overProvisionedComputeDelta } from "./pricing.js";

export interface ReconcileSupabaseArgs {
  projects: NormalizedProject[];
  computeByRef: Record<string, NormalizedCompute>;
  branchesByRef: Record<string, NormalizedBranch[]>;
  active: SupabaseActive;
  config: CostguardConfig;
  workspace: string;
}

function isActiveProject(status: string): boolean {
  return status === "ACTIVE_HEALTHY" || status === "";
}

export function reconcileSupabase(args: ReconcileSupabaseArgs): Finding[] {
  const {
    projects,
    computeByRef,
    branchesByRef,
    active,
    config,
    workspace,
  } = args;

  const pricing = config.defaults.supabaseComputePricingMonthly;
  const declaredSet = new Set(active.projects);
  const findings: Finding[] = [];

  for (const project of projects) {
    if (!isActiveProject(project.status)) continue;

    const compute = computeByRef[project.ref];

    if (!declaredSet.has(project.ref)) {
      // Orphaned project
      const computeSize = compute?.computeSize ?? "micro";
      findings.push({
        workspace,
        provider: "supabase",
        rule: "supabase/orphaned-project",
        severity: "high",
        estMonthlyUsd: monthlyUsdForTier(computeSize, pricing),
        title: `Orphaned Supabase project: ${project.ref}`,
        detail: `Project "${project.ref}" (${project.name}) is active but not declared in active.projects.`,
        fix: "Confirm this project is needed; pause/delete it in the Supabase dashboard or add it to active.projects.",
        autofixable: false,
      });
      continue;
    }

    // Declared project — check compute and pitr
    if (compute !== undefined) {
      const declaredCompute = active.compute ?? "micro";
      const delta = overProvisionedComputeDelta(declaredCompute, compute.computeSize, pricing);
      if (delta > 0) {
        findings.push({
          workspace,
          provider: "supabase",
          rule: "supabase/over-provisioned-compute",
          severity: "warn",
          estMonthlyUsd: delta,
          title: `Over-provisioned compute on project: ${project.ref}`,
          detail: `Project "${project.ref}" is running "${compute.computeSize}" but declared compute is "${declaredCompute}". Monthly delta: $${delta}.`,
          fix: `Downsize the compute tier to "${declaredCompute}" in the Supabase dashboard, or update active.compute to "${compute.computeSize}".`,
          autofixable: false,
        });
      }

      if (compute.pitrEnabled && active.pitr !== true) {
        findings.push({
          workspace,
          provider: "supabase",
          rule: "supabase/pitr-undeclared",
          severity: "warn",
          estMonthlyUsd: config.defaults.supabasePitrAddonMonthly,
          title: `PITR addon undeclared on project: ${project.ref}`,
          detail: `Project "${project.ref}" has PITR enabled but active.pitr is not set to true.`,
          fix: `If PITR is intentional, set active.pitr: true. Otherwise disable PITR in the Supabase dashboard to avoid the ~$${config.defaults.supabasePitrAddonMonthly}/mo charge.`,
          autofixable: false,
        });
      }
    }

    // Orphaned branches
    const branches = branchesByRef[project.ref] ?? [];
    const declaredBranches = new Set(active.branches ?? []);
    for (const branch of branches) {
      if (!branch.isDefault && !declaredBranches.has(branch.name)) {
        findings.push({
          workspace,
          provider: "supabase",
          rule: "supabase/orphaned-branch",
          severity: "warn",
          estMonthlyUsd: config.defaults.supabasePreviewBranchMonthly,
          title: `Orphaned preview branch: ${branch.name} (${project.ref})`,
          detail: `Branch "${branch.name}" on project "${project.ref}" is not declared in active.branches and costs ~$${config.defaults.supabasePreviewBranchMonthly}/cyc.`,
          fix: `Delete the preview branch "${branch.name}" in the Supabase dashboard to stop the $${config.defaults.supabasePreviewBranchMonthly}/cyc preview-branch leak, or add it to active.branches.`,
          autofixable: false,
        });
      }
    }
  }

  findings.sort((a, b) => {
    const refA = a.title;
    const refB = b.title;
    if (refA < refB) return -1;
    if (refA > refB) return 1;
    return a.rule.localeCompare(b.rule);
  });

  return findings;
}
