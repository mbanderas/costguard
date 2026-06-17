import type { Finding } from "../../types.js";
import { loadCloudflarePricing } from "./pricing.js";

// ------------------------------------------------------------------
// Cloudflare R2 reconcile (pure). Takes normalized usage (operator-declared
// or API-derived) plus the sourced knowledge/cloudflare.json economics and
// emits cost findings. Kept free of fetch/IO so it is testable offline.
// ------------------------------------------------------------------

export interface NormalizedR2Usage {
  storageGb: number;
  /** Class A (write/list) operations this month. */
  classAOps: number;
  /** Class B (read) operations this month. */
  classBOps: number;
}

export interface ReconcileCloudflareArgs {
  usage: NormalizedR2Usage;
  workspace: string;
}

// Below this monthly op spend the op-heavy signal is not worth flagging.
const MIN_OP_SPEND_USD = 5;

function billableCost(used: number, free: number, usdPerMillion: number): number {
  return (Math.max(0, used - free) / 1_000_000) * usdPerMillion;
}

/**
 * Reconcile Cloudflare R2 usage against the sourced economics.
 *
 * cloudflare/r2-op-heavy: when Class A/B operation charges dwarf storage cost,
 * it signals a small-object anti-pattern (e.g. R2 used as a per-request log or
 * cache sink). Batching writes/reads cuts the dominant op spend.
 */
export function reconcileCloudflare(args: ReconcileCloudflareArgs): Finding[] {
  const { usage, workspace } = args;
  const { r2 } = loadCloudflarePricing();

  const storageCost = Math.max(0, usage.storageGb - r2.freeStorageGb) * r2.storageUsdPerGbMonth;
  const classACost = billableCost(usage.classAOps, r2.freeClassAOps, r2.classAUsdPerMillion);
  const classBCost = billableCost(usage.classBOps, r2.freeClassBOps, r2.classBUsdPerMillion);
  const opsCost = classACost + classBCost;

  if (opsCost <= storageCost || opsCost < MIN_OP_SPEND_USD) return [];

  return [
    {
      workspace,
      provider: "cloudflare",
      rule: "cloudflare/r2-op-heavy",
      severity: opsCost >= 50 ? "high" : "warn",
      estMonthlyUsd: opsCost,
      title: `R2 operation charges (~$${opsCost.toFixed(2)}/mo) dwarf storage (~$${storageCost.toFixed(2)}/mo)`,
      detail:
        `R2 billed ~$${classACost.toFixed(2)}/mo Class A + ~$${classBCost.toFixed(2)}/mo Class B operations ` +
        `vs only ~$${storageCost.toFixed(2)}/mo storage on ${usage.storageGb} GB. Operations dominating storage ` +
        `signals a small-object anti-pattern (per-request writes/reads of tiny objects).`,
      fix:
        "Batch small writes/reads, add a cache in front of hot reads, or coalesce per-request objects. " +
        "Class A (write/list) ops at $4.50/M are the costliest — target those first.",
      autofixable: false,
    },
  ];
}
