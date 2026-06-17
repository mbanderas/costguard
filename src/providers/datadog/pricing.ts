import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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

// knowledge/datadog.json sits at the repo/package root. This module compiles to
// dist/providers/datadog/pricing.js and runs from src/providers/datadog via tsx;
// both are three levels below the root, so the same relative path resolves.
const here = path.dirname(fileURLToPath(import.meta.url));
const FACT_PATH = path.join(here, "..", "..", "..", "knowledge", "datadog.json");

let cached: DatadogPricing | undefined;

/** Load + validate the Datadog pricing facts (cached). */
export function loadDatadogPricing(): DatadogPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = DatadogPricingSchema.parse(raw);
  return cached;
}
