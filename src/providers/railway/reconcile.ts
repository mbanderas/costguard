import type { Finding } from "../../types.js";
import type { CostguardConfig } from "../../config.js";
import type { RailwayActive } from "./types.js";
import { idleServiceMonthlyCost } from "./pricing.js";

export interface ReconcileRailwayArgs {
  projectName: string;
  services: Array<{ id: string; name: string; updatedAt: string | null }>;
  deployments: Array<{ id: string; status: string; createdAt: string | null }>;
  estimatedUsage: number;
  active: RailwayActive;
  config: CostguardConfig;
  workspace: string;
  now?: Date;
}

const LINGERING_STATUSES = new Set(["CRASHED", "REMOVED", "FAILED"]);

export function reconcileRailway(args: ReconcileRailwayArgs): Finding[] {
  const {
    projectName,
    services,
    deployments,
    estimatedUsage,
    active,
    config,
    workspace,
    now = new Date(),
  } = args;

  const findings: Finding[] = [];
  const activeSet = new Set(active.services);
  const idleDays = active.idleDays ?? 30;
  const idleMs = idleDays * 24 * 60 * 60 * 1000;
  const baseMonthly = config.defaults.railwayBaseMonthly;

  // orphaned-service: live service not declared in active.services
  for (const svc of services) {
    if (!activeSet.has(svc.name)) {
      const est =
        estimatedUsage > 0
          ? estimatedUsage / services.length
          : baseMonthly;
      findings.push({
        workspace,
        provider: "railway",
        rule: "railway/orphaned-service",
        severity: "high",
        estMonthlyUsd: est,
        title: `Undeclared Railway service: ${svc.name} (project: ${projectName})`,
        detail: `Service "${svc.name}" (id: ${svc.id}) exists in Railway project "${projectName}" but is not listed in active.railway.services.`,
        fix: "Confirm this service is needed; remove it in Railway or add to workspaces.json active.railway.services.",
        autofixable: false,
      });
    }
  }

  // idle-service: updatedAt older than idleDays from now
  for (const svc of services) {
    if (svc.updatedAt === null) continue;
    const updatedAt = new Date(svc.updatedAt);
    if (now.getTime() - updatedAt.getTime() > idleMs) {
      findings.push({
        workspace,
        provider: "railway",
        rule: "railway/idle-service",
        severity: "warn",
        estMonthlyUsd: idleServiceMonthlyCost(baseMonthly, services.length),
        title: `Idle Railway service: ${svc.name} (project: ${projectName})`,
        detail: `Service "${svc.name}" (id: ${svc.id}) has not been updated in over ${idleDays} days (last updated: ${svc.updatedAt}).`,
        fix: `Pause or remove the idle service "${svc.name}" in Railway to avoid ongoing charges.`,
        autofixable: false,
      });
    }
  }

  // lingering-deploy: deployments with bad statuses
  const lingering = deployments.filter((d) => LINGERING_STATUSES.has(d.status));
  if (lingering.length > 0) {
    const ids = lingering.map((d) => `${d.id}(${d.status})`).join(", ");
    findings.push({
      workspace,
      provider: "railway",
      rule: "railway/lingering-deploy",
      severity: "info",
      estMonthlyUsd: 0,
      title: `Lingering failed deployments in project: ${projectName}`,
      detail: `Deployments with terminal error statuses: ${ids}`,
      fix: "Clean up failed/removed deployments.",
      autofixable: false,
    });
  }

  // Deterministic sort: rule asc, then title asc
  return findings.slice().sort((a, b) => {
    const ruleOrder = a.rule.localeCompare(b.rule);
    return ruleOrder !== 0 ? ruleOrder : a.title.localeCompare(b.title);
  });
}
