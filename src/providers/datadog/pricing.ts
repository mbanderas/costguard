import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// ------------------------------------------------------------------
// Sourced Datadog economics, loaded from the versioned knowledge fact file
// (knowledge/datadog.json). The reconcile reads rates from here instead of
// hardcoding. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const DatadogPricingSchema = z.object({
  provider: z.literal("datadog"),
  updated: z.string(),
  infraHostMonthlyUsd: z.number().nonnegative(),
  apmHostMonthlyUsd: z.object({
    pro: z.number().nonnegative(),
    enterprise: z.number().nonnegative(),
  }),
  ingestedLogGbUsd: z.number().nonnegative(),
  indexedSpansPer1mUsd: z.number().nonnegative(),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type DatadogPricing = z.infer<typeof DatadogPricingSchema>;
export type DatadogPlanId = "pro" | "enterprise";

const FACT_PATH = knowledgePath("datadog.json");

let cached: DatadogPricing | undefined;

/** Load + validate the Datadog pricing facts (cached). */
export function loadDatadogPricing(): DatadogPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = DatadogPricingSchema.parse(raw);
  return cached;
}
