import type { Finding } from "../../types.js";
import { loadUpstashPricing } from "./pricing.js";

// ------------------------------------------------------------------
// Upstash usage reconcile (pure). Takes normalized usage (from the API or a
// fixture) plus the sourced knowledge/upstash.json economics and emits cost
// findings. Kept free of fetch/IO so it is testable offline.
// ------------------------------------------------------------------

export interface NormalizedUpstashUsage {
  plan: "payg" | "fixed";
  /** Redis commands executed this month across the database. */
  monthlyCommands: number;
  /** Stored data size in GB. */
  storageGb: number;
}

export interface ReconcileUpstashArgs {
  usage: NormalizedUpstashUsage;
  workspace: string;
}

/** Monthly pay-as-you-go cost for a given command + storage footprint. */
function paygMonthlyCost(monthlyCommands: number, storageGb: number): number {
  const p = loadUpstashPricing();
  const commandCost = (monthlyCommands / 100_000) * p.paygPer100kCommandsUsd;
  const billableStorage = Math.max(0, storageGb - p.paygFreeStorageGb);
  return commandCost + billableStorage * p.paygStorageUsdPerGbMonth;
}

/**
 * Reconcile Upstash usage against the sourced economics.
 *
 * upstash/payg-vs-fixed: a high-command workload on pay-as-you-go can cost far
 * more than a fixed plan that covers the same storage (fixed plans allow
 * unlimited commands under a TPS cap). Flags the cheaper-fixed delta.
 */
export function reconcileUpstash(args: ReconcileUpstashArgs): Finding[] {
  const { usage, workspace } = args;
  if (usage.plan !== "payg") return [];

  const pricing = loadUpstashPricing();
  const payg = paygMonthlyCost(usage.monthlyCommands, usage.storageGb);

  // Cheapest fixed plan whose storage covers the current footprint.
  const fitting = pricing.fixedPlans
    .filter((p) => p.storageGb >= usage.storageGb)
    .sort((a, b) => a.monthlyUsd - b.monthlyUsd);
  const cheapest = fitting[0];
  if (cheapest === undefined || payg <= cheapest.monthlyUsd) return [];

  const est = payg - cheapest.monthlyUsd;
  return [
    {
      workspace,
      provider: "upstash",
      rule: "upstash/payg-vs-fixed",
      severity: "high",
      estMonthlyUsd: est,
      title: `Upstash pay-as-you-go costs ~$${payg.toFixed(2)}/mo vs $${cheapest.monthlyUsd} on the ${cheapest.name} fixed plan`,
      detail:
        `~${usage.monthlyCommands.toLocaleString()} commands/mo + ${usage.storageGb} GB on pay-as-you-go ` +
        `bills ~$${payg.toFixed(2)}/mo ($${pricing.paygPer100kCommandsUsd}/100k commands). The ${cheapest.name} ` +
        `fixed plan ($${cheapest.monthlyUsd}/mo) covers this storage with unlimited commands under a TPS cap — ` +
        `~$${est.toFixed(2)}/mo cheaper. (Free command tier not modeled; verify TPS headroom before switching.)`,
      fix:
        `Switch this database to the ${cheapest.name} fixed plan if its TPS cap fits your peak throughput. ` +
        "High-command queue/rate-limit workloads are the usual pay-as-you-go cost trap.",
      autofixable: false,
    },
  ];
}
