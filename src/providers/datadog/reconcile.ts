import type { Finding } from "../../types.js";
import { loadDatadogPricing, type DatadogPlanId } from "./pricing.js";

// ------------------------------------------------------------------
// Datadog reconcile (pure). Takes normalized usage (operator-declared) plus the
// sourced knowledge/datadog.json rates and emits cost findings. Kept free of
// fetch/IO so it is testable offline.
// ------------------------------------------------------------------

export interface NormalizedDatadogUsage {
  plan: DatadogPlanId;
  /** Hosts currently reporting APM (high-water-mark count). */
  apmHostsActive: number;
  /** Hosts that genuinely need APM coverage. */
  apmHostsNeeded: number;
}

export interface ReconcileDatadogArgs {
  usage: NormalizedDatadogUsage;
  workspace: string;
}

/**
 * Reconcile Datadog usage against the sourced per-host rates.
 *
 * datadog/excess-apm-hosts: APM enabled on more hosts than need coverage bills
 * $31-40/host/mo for low-value services. Datadog's high-water-mark model makes
 * even short-lived host spikes costly.
 */
export function reconcileDatadog(args: ReconcileDatadogArgs): Finding[] {
  const { usage, workspace } = args;
  const pricing = loadDatadogPricing();
  const rate = pricing.apmHostMonthlyUsd[usage.plan];

  const excess = Math.max(0, usage.apmHostsActive - usage.apmHostsNeeded);
  if (excess <= 0) return [];

  const est = excess * rate;
  return [
    {
      workspace,
      provider: "datadog",
      rule: "datadog/excess-apm-hosts",
      severity: "high",
      estMonthlyUsd: est,
      title: `${excess} Datadog APM host(s) beyond need — ~$${est}/mo`,
      detail:
        `APM reports on ${usage.apmHostsActive} hosts but only ${usage.apmHostsNeeded} need coverage ` +
        `(${usage.plan} rate $${rate}/host/mo). ${excess} excess host(s) cost ~$${est}/mo. ` +
        `Datadog bills on a high-water-mark, so autoscaling spikes set a higher floor.`,
      fix:
        "Scope the APM integration to services that need tracing (not every node/container). " +
        "Disable the Datadog agent's APM on low-value hosts and cap autoscaling host churn.",
      autofixable: false,
    },
  ];
}
