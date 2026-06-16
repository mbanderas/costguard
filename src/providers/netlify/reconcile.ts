import type { Finding } from "../../types.js";
import type { CostguardConfig } from "../../config.js";
import type { NetlifyActive } from "./types.js";
import type { NormalizedSite, NormalizedBandwidth, NormalizedBuildUsage } from "./api.js";
import { buildMinuteOverageCost, bandwidthOverageCost } from "./pricing.js";

export interface ReconcileNetlifyArgs {
  sites: NormalizedSite[];
  bandwidth?: NormalizedBandwidth;
  build?: NormalizedBuildUsage;
  active: NetlifyActive;
  config: CostguardConfig;
  workspace: string;
}

export function reconcileNetlify(args: ReconcileNetlifyArgs): Finding[] {
  const { sites, bandwidth, build, active, config, workspace } = args;
  const { defaults } = config;
  const activeSiteSet = new Set(active.sites);
  const findings: Finding[] = [];

  for (const site of sites) {
    const matchedByName = activeSiteSet.has(site.name);
    const matchedById = activeSiteSet.has(site.id);
    if (!matchedByName && !matchedById) {
      findings.push({
        workspace,
        provider: "netlify",
        rule: "netlify/orphaned-site",
        severity: "high",
        estMonthlyUsd: defaults.netlifyBuildMinuteOverageRate * 50,
        title: `Orphaned Netlify site: ${site.name}`,
        detail: `Site "${site.name}" (id: ${site.id}) is live but not declared in active.netlify.sites.`,
        fix: "Confirm this site is needed; delete it in Netlify or add to workspaces.json active.netlify.sites.",
        autofixable: false,
      });
    }
  }

  if (build !== undefined && build.usedMinutes > defaults.netlifyFreeBuildMinutesPerMonth) {
    const est = buildMinuteOverageCost(
      build.usedMinutes,
      defaults.netlifyFreeBuildMinutesPerMonth,
      defaults.netlifyBuildMinuteOverageRate,
    );
    findings.push({
      workspace,
      provider: "netlify",
      rule: "netlify/build-minutes",
      severity: "warn",
      estMonthlyUsd: est,
      title: `Netlify build minutes overage`,
      detail: `Used ${build.usedMinutes} of ${build.includedMinutes} included build minutes this month.`,
      fix: "Enable build caching, reduce redundant deploys, or upgrade your Netlify plan.",
      autofixable: false,
    });
  }

  if (bandwidth !== undefined && bandwidth.usedGb > defaults.netlifyFreeBandwidthGb) {
    const est = bandwidthOverageCost(
      bandwidth.usedGb,
      defaults.netlifyFreeBandwidthGb,
      defaults.netlifyBandwidthOverageRatePerGb,
    );
    findings.push({
      workspace,
      provider: "netlify",
      rule: "netlify/bandwidth-overage",
      severity: "warn",
      estMonthlyUsd: est,
      title: `Netlify bandwidth overage`,
      detail: `Used ${bandwidth.usedGb} GB of ${bandwidth.includedGb} GB included bandwidth this month.`,
      fix: "Add a CDN layer, optimize asset sizes, or upgrade your Netlify plan.",
      autofixable: false,
    });
  }

  findings.sort((a, b) => {
    const ruleComp = a.rule.localeCompare(b.rule);
    if (ruleComp !== 0) return ruleComp;
    return a.title.localeCompare(b.title);
  });

  return findings;
}
