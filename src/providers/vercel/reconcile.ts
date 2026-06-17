import type { Finding } from "../../types.js";
import { loadVercelPricing } from "./pricing.js";

// ------------------------------------------------------------------
// Vercel usage reconcile (pure). Takes normalized usage (from the API or a
// fixture) plus the sourced knowledge/vercel.json economics and emits cost
// findings. Kept free of fetch/IO so it is testable offline.
// ------------------------------------------------------------------

export interface NormalizedVercelUsage {
  plan: "pro" | "hobby";
  /** Total paid deploying (Owner/Member) seats on the team. */
  paidDeployingSeats: number;
  /** Seats that actually shipped a deploy in the billing period. */
  activeDeployingSeats: number;
}

export interface ReconcileVercelArgs {
  usage: NormalizedVercelUsage;
  workspace: string;
}

/**
 * Reconcile Vercel usage against the sourced plan economics.
 *
 * vercel/idle-seats: Pro bills $20/mo per deploying seat beyond the one
 * included seat. A paid seat that never deploys in the period is pure waste.
 */
export function reconcileVercel(args: ReconcileVercelArgs): Finding[] {
  const { usage, workspace } = args;
  if (usage.plan !== "pro") return [];

  const pro = loadVercelPricing().plans.pro;
  const findings: Finding[] = [];

  // Idle paid seats = total paid seats minus the larger of active deployers
  // and the single included seat (the included seat is free regardless).
  const justified = Math.max(usage.activeDeployingSeats, pro.includedDeployingSeats);
  const idlePaidSeats = Math.max(0, usage.paidDeployingSeats - justified);

  if (idlePaidSeats > 0) {
    const est = idlePaidSeats * pro.additionalSeatUsd;
    findings.push({
      workspace,
      provider: "vercel",
      rule: "vercel/idle-seats",
      severity: "high",
      estMonthlyUsd: est,
      title: `${idlePaidSeats} idle paid Vercel deploying seat(s) — $${est}/mo`,
      detail:
        `Team has ${usage.paidDeployingSeats} paid deploying seats but only ` +
        `${usage.activeDeployingSeats} deployed in the period (1 seat is included free). ` +
        `${idlePaidSeats} paid seat(s) at $${pro.additionalSeatUsd}/mo are unused.`,
      fix:
        "Downgrade idle Owner/Member seats to free Viewer roles in the Vercel team " +
        "settings, or remove members who no longer deploy.",
      autofixable: false,
    });
  }

  return findings;
}
