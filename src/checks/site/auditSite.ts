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
  const findings: Finding[] = [];
  for (const target of targets) {
    if (target.site === undefined || target.site.length === 0) continue;
    try {
      findings.push(...(await analyzeSite(target.site, { workspace: target.workspace })));
    } catch {
      // unreachable site — skip, never abort the audit
    }
  }
  return findings;
}
