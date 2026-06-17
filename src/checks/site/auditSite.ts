import type { Finding } from "../../types.js";
import { analyzeSite } from "./analyze.js";

export interface SiteTarget {
  workspace: string;
  site?: string | undefined;
}

/**
 * Run read-only live-site checks for each target that declares a site URL.
 * A target with no URL is skipped (not failed), mirroring the provider
 * "token absent -> skip" pattern. A fetch error on one site is swallowed so a
 * single unreachable site never aborts the wider audit.
 */
export async function collectSiteFindings(targets: SiteTarget[]): Promise<Finding[]> {
  const active = targets.filter(
    (t): t is SiteTarget & { site: string } => t.site !== undefined && t.site.length > 0,
  );
  // Independent per-workspace site checks run concurrently; a rejected (unreachable)
  // site is swallowed so it never aborts the audit. Results flatten in target order.
  const settled = await Promise.allSettled(
    active.map((t) => analyzeSite(t.site, { workspace: t.workspace })),
  );
  const findings: Finding[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") findings.push(...r.value);
  }
  return findings;
}
