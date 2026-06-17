import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// ------------------------------------------------------------------
// Sourced Sentry plan economics, loaded from the versioned knowledge fact
// file (knowledge/sentry.json). The reconcile reads rates from here instead
// of hardcoding. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const PlanSchema = z.object({
  monthlyUsd: z.number().nonnegative(),
  includedErrors: z.number().nonnegative(),
});

const SentryPricingSchema = z.object({
  provider: z.literal("sentry"),
  updated: z.string(),
  plans: z.object({
    developer: PlanSchema,
    team: PlanSchema,
    business: PlanSchema,
  }),
  errorOverageUsdPerEvent: z.number().nonnegative(),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type SentryPricing = z.infer<typeof SentryPricingSchema>;
export type SentryPlanId = "developer" | "team" | "business";

const FACT_PATH = knowledgePath("sentry.json");

let cached: SentryPricing | undefined;

/** Load + validate the Sentry pricing facts (cached). */
export function loadSentryPricing(): SentryPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = SentryPricingSchema.parse(raw);
  return cached;
}
