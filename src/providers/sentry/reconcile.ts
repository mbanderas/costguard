import type { Finding } from "../../types.js";
import { loadSentryPricing, type SentryPlanId } from "./pricing.js";

// ------------------------------------------------------------------
// Sentry usage reconcile (pure). Takes normalized usage (from the API or a
// fixture) plus the sourced knowledge/sentry.json economics and emits cost
// findings. Kept free of fetch/IO so it is testable offline.
// ------------------------------------------------------------------

export interface NormalizedSentryUsage {
  plan: SentryPlanId;
  /** Error events ingested this month across the organization. */
  monthlyErrorEvents: number;
}

export interface ReconcileSentryArgs {
  usage: NormalizedSentryUsage;
  workspace: string;
}

/**
 * Reconcile Sentry usage against the sourced plan economics.
 *
 * sentry/error-overage: error events beyond the plan quota are billed per
 * event at the PAYG rate (when on-demand budget is enabled). Heavy unsampled
 * noise (adblocker/extension errors) is the usual cause.
 */
export function reconcileSentry(args: ReconcileSentryArgs): Finding[] {
  const { usage, workspace } = args;
  const pricing = loadSentryPricing();
  const plan = pricing.plans[usage.plan];

  const overage = Math.max(0, usage.monthlyErrorEvents - plan.includedErrors);
  if (overage <= 0) return [];

  const est = overage * pricing.errorOverageUsdPerEvent;
  return [
    {
      workspace,
      provider: "sentry",
      rule: "sentry/error-overage",
      severity: est >= 25 ? "high" : "warn",
      estMonthlyUsd: est,
      title: `Sentry error events over the ${usage.plan} quota — ~$${est.toFixed(2)}/mo`,
      detail:
        `Ingested ${usage.monthlyErrorEvents} error events vs the ${usage.plan} plan quota of ` +
        `${plan.includedErrors}. ${overage} events over quota at $${pricing.errorOverageUsdPerEvent}/event ` +
        `(pay-as-you-go). Applies only when an on-demand budget is enabled; otherwise excess events are dropped.`,
      fix:
        "Add SDK-side filtering (beforeSend, ignoreErrors) and an error sample rate to drop noise " +
        "(adblocker/extension/3rd-party errors) before it reaches Sentry, or lower the on-demand budget.",
      autofixable: false,
    },
  ];
}
