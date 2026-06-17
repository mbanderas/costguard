import type { Finding } from "../../types.js";
import { loadAtlasPricing, type AtlasTier } from "./pricing.js";

// ------------------------------------------------------------------
// MongoDB Atlas reconcile (pure). Takes normalized clusters (from the API or a
// fixture) plus the sourced knowledge/atlas.json tier ladder and emits cost
// findings. Kept free of fetch/IO so it is testable offline.
// ------------------------------------------------------------------

export interface NormalizedAtlasCluster {
  name: string;
  /** Atlas tier name, e.g. "M10". */
  tier: string;
  /** Deployment environment label (from cluster name/tags). */
  env: string;
  /** Logical data size in GB. */
  dataSizeGb: number;
}

export interface ReconcileAtlasArgs {
  clusters: NormalizedAtlasCluster[];
  workspace: string;
}

// Non-production environments where a dedicated cluster is rarely justified.
const NON_PROD = new Set([
  "dev",
  "development",
  "staging",
  "stage",
  "test",
  "testing",
  "qa",
  "sandbox",
]);

/** Cheapest PAID tier (excludes free M0) whose storage covers the data size. */
function cheapestPaidFitting(tiers: AtlasTier[], dataSizeGb: number): AtlasTier | undefined {
  return tiers
    .filter((t) => t.monthlyUsd > 0 && t.storageGb >= dataSizeGb)
    .sort((a, b) => a.monthlyUsd - b.monthlyUsd)[0];
}

/**
 * Reconcile Atlas clusters against the sourced tier ladder.
 *
 * atlas/oversized-cluster: a non-prod cluster on a dedicated tier (M10+) that
 * holds little data can drop to a far cheaper shared tier. Prod is excluded —
 * downsizing it needs performance headroom analysis, not just data size.
 */
export function reconcileAtlas(args: ReconcileAtlasArgs): Finding[] {
  const { clusters, workspace } = args;
  const pricing = loadAtlasPricing();
  const findings: Finding[] = [];

  for (const cluster of clusters) {
    if (!NON_PROD.has(cluster.env.toLowerCase())) continue;

    const current = pricing.tiers.find((t) => t.name === cluster.tier);
    if (current === undefined || !current.dedicated) continue;

    const target = cheapestPaidFitting(pricing.tiers, cluster.dataSizeGb);
    if (target === undefined || target.monthlyUsd >= current.monthlyUsd) continue;

    const est = current.monthlyUsd - target.monthlyUsd;
    findings.push({
      workspace,
      provider: "atlas",
      rule: "atlas/oversized-cluster",
      severity: "high",
      estMonthlyUsd: est,
      title: `Atlas ${cluster.env} cluster '${cluster.name}' runs dedicated ${current.name} on ${cluster.dataSizeGb} GB`,
      detail:
        `Cluster '${cluster.name}' (${cluster.env}) is on dedicated ${current.name} ` +
        `($${current.monthlyUsd}/mo) but holds only ${cluster.dataSizeGb} GB. The shared ${target.name} ` +
        `tier ($${target.monthlyUsd}/mo) covers that data — ~$${est.toFixed(2)}/mo cheaper for a non-prod cluster.`,
      fix:
        `Downsize '${cluster.name}' to ${target.name} (or pause it when idle). ` +
        "Keep dedicated tiers for production or genuinely CPU/IO-bound workloads only.",
      autofixable: false,
    });
  }

  return findings;
}
