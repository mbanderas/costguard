import type { Finding } from "../../types.js";
import { loadFlyPricing } from "./pricing.js";

// ------------------------------------------------------------------
// Fly.io reconcile (pure). Takes normalized apps (operator-declared, confirmed
// live) plus the sourced knowledge/fly.json rates and emits cost findings.
// Kept free of fetch/IO so it is testable offline.
// ------------------------------------------------------------------

export interface NormalizedFlyApp {
  name: string;
  /** Count of dedicated public IPv4 addresses attached to the app. */
  dedicatedIpv4Count: number;
  /** Whether the operator marked the app production-critical. */
  critical: boolean;
}

export interface ReconcileFlyArgs {
  apps: NormalizedFlyApp[];
  workspace: string;
}

/**
 * Reconcile Fly apps against the sourced rates.
 *
 * fly/orphaned-ipv4: a dedicated IPv4 costs $2/mo per app. On non-critical /
 * preview apps these are usually safe to release (shared IPv4 is free).
 */
export function reconcileFly(args: ReconcileFlyArgs): Finding[] {
  const { apps, workspace } = args;
  const rate = loadFlyPricing().dedicatedIpv4UsdPerMonth;
  const findings: Finding[] = [];

  for (const app of apps) {
    if (app.critical || app.dedicatedIpv4Count <= 0) continue;

    const est = app.dedicatedIpv4Count * rate;
    findings.push({
      workspace,
      provider: "fly",
      rule: "fly/orphaned-ipv4",
      severity: est >= 20 ? "high" : "warn",
      estMonthlyUsd: est,
      title: `Fly app '${app.name}' holds ${app.dedicatedIpv4Count} dedicated IPv4 — $${est}/mo`,
      detail:
        `Non-critical app '${app.name}' has ${app.dedicatedIpv4Count} dedicated IPv4 address(es) at ` +
        `$${rate}/mo each. Preview/non-critical apps rarely need a dedicated IPv4 — a shared IPv4 is free.`,
      fix:
        `Release the dedicated IPv4 with \`fly ips release <addr> -a ${app.name}\` and use a shared IPv4, ` +
        "unless the app genuinely needs a dedicated address (e.g. custom TLS at the IP).",
      autofixable: false,
    });
  }

  return findings;
}
