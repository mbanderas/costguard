import type { Finding } from "../../types.js";
import type { CostguardConfig } from "../../config.js";
import type { UsageItem, GithubActive } from "./types.js";
import { estimateOverageUsd } from "./pricing.js";

interface RepoGroup {
  minutes: number;
  net: number;
}

function isMinutesUnit(unitType: string | null | undefined): boolean {
  if (unitType == null) return true;
  return /min/i.test(unitType);
}

function groupByRepo(items: UsageItem[]): Map<string, RepoGroup> {
  const map = new Map<string, RepoGroup>();
  for (const item of items) {
    if (!/actions/i.test(item.product)) continue;
    if (item.repositoryName == null) continue;
    const repoName = item.repositoryName;
    const existing = map.get(repoName) ?? { minutes: 0, net: 0 };
    const addMinutes = isMinutesUnit(item.unitType) ? item.quantity : 0;
    map.set(repoName, {
      minutes: existing.minutes + addMinutes,
      net: existing.net + item.netAmount,
    });
  }
  return map;
}

export function reconcileGithub(
  items: UsageItem[],
  active: GithubActive,
  config: CostguardConfig,
  workspace: string,
): Finding[] {
  const declaredRepoName = active.repo.split("/").pop() ?? active.repo;
  const grouped = groupByRepo(items);
  const findings: Finding[] = [];

  for (const [repoName, group] of grouped) {
    if (repoName !== declaredRepoName) {
      if (group.net > 0) {
        findings.push({
          workspace,
          provider: "github",
          rule: "github/orphaned-repo-spend",
          severity: "warn",
          estMonthlyUsd: group.net,
          title: `Unregistered repo Actions spend: ${repoName}`,
          detail: `Repo "${repoName}" consumed ~${group.minutes} minutes (net $${group.net.toFixed(2)}) but is not declared in workspaces.json for this workspace.`,
          fix: "Confirm this repo's Actions usage is expected; add it to workspaces.json active.github or disable its workflows.",
          autofixable: false,
        });
      }
    } else {
      const budget = active.minutesBudget ?? config.defaults.githubFreeMinutesPerMonth;
      if (group.minutes > budget) {
        const severity = group.net > 0 ? "high" : "warn";
        const estMonthlyUsd =
          group.net > 0
            ? group.net
            : estimateOverageUsd(group.minutes, budget, config.defaults.ciMinuteRate);
        findings.push({
          workspace,
          provider: "github",
          rule: "github/actions-over-budget",
          severity,
          estMonthlyUsd,
          title: `Actions minutes over budget: ${repoName}`,
          detail: `Repo "${repoName}" used ${group.minutes} minutes vs budget ${budget} (overage: ${group.minutes - budget} min; net billed: $${group.net.toFixed(2)}).`,
          fix: "Reduce Actions minutes: cache deps, cut redundant workflows (see ci/* findings), or raise the declared budget.",
          autofixable: false,
        });
      }
    }
  }

  findings.sort((a, b) => a.title.localeCompare(b.title));
  return findings;
}
