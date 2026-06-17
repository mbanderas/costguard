import type { Finding } from "../../types.js";
import { loadRenderPricing } from "./pricing.js";

// ------------------------------------------------------------------
// Render reconcile (pure). Takes normalized services (live plan + declared env)
// plus the sourced knowledge/render.json plan ladder and emits cost findings.
// Kept free of fetch/IO so it is testable offline.
// ------------------------------------------------------------------

export interface NormalizedRenderService {
  name: string;
  /** Render compute plan slug, e.g. "pro". */
  plan: string;
  /** Deployment environment label. */
  env: string;
}

export interface ReconcileRenderArgs {
  services: NormalizedRenderService[];
  workspace: string;
}

// Non-production environments where an oversized always-on plan is rarely
// justified. Standard (1 vCPU / 2 GB) is the recommended non-prod floor.
const NON_PROD = new Set([
  "dev",
  "development",
  "staging",
  "stage",
  "test",
  "testing",
  "qa",
  "sandbox",
  "preview",
]);
const RECOMMENDED_PLAN = "standard";

/**
 * Reconcile Render services against the sourced plan ladder.
 *
 * render/oversized-instance: a non-prod service on a plan above Standard is
 * usually over-sized; Standard (1 vCPU / 2 GB) covers most non-prod workloads.
 * Prod is excluded — downsizing it needs load analysis.
 */
export function reconcileRender(args: ReconcileRenderArgs): Finding[] {
  const { services, workspace } = args;
  const pricing = loadRenderPricing();
  const standard = pricing.computePlans.find((p) => p.name === RECOMMENDED_PLAN);
  if (standard === undefined) return [];

  const findings: Finding[] = [];
  for (const svc of services) {
    if (!NON_PROD.has(svc.env.toLowerCase())) continue;

    const current = pricing.computePlans.find((p) => p.name === svc.plan);
    if (current === undefined || current.monthlyUsd <= standard.monthlyUsd) continue;

    const est = current.monthlyUsd - standard.monthlyUsd;
    findings.push({
      workspace,
      provider: "render",
      rule: "render/oversized-instance",
      severity: "high",
      estMonthlyUsd: est,
      title: `Render ${svc.env} service '${svc.name}' runs the ${current.name} plan ($${current.monthlyUsd}/mo)`,
      detail:
        `Service '${svc.name}' (${svc.env}) is on the ${current.name} plan ` +
        `($${current.monthlyUsd}/mo, ${current.vcpu} vCPU / ${current.ramGb} GB). The ${standard.name} plan ` +
        `($${standard.monthlyUsd}/mo, ${standard.vcpu} vCPU / ${standard.ramGb} GB) covers most non-prod ` +
        `workloads — ~$${est}/mo cheaper.`,
      fix:
        `Downsize '${svc.name}' to the ${standard.name} plan (or suspend it when idle). ` +
        "Keep larger plans for production or genuinely CPU/RAM-bound services only.",
      autofixable: false,
    });
  }

  return findings;
}
