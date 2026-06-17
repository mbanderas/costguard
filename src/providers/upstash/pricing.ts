import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// ------------------------------------------------------------------
// Sourced Upstash Redis economics, loaded from the versioned knowledge fact
// file (knowledge/upstash.json). The reconcile reads rates from here instead
// of hardcoding. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const FixedPlanSchema = z.object({
  name: z.string(),
  storageGb: z.number().positive(),
  monthlyUsd: z.number().nonnegative(),
});

const UpstashPricingSchema = z.object({
  provider: z.literal("upstash"),
  updated: z.string(),
  paygPer100kCommandsUsd: z.number().nonnegative(),
  paygStorageUsdPerGbMonth: z.number().nonnegative(),
  paygFreeStorageGb: z.number().nonnegative(),
  fixedPlans: z.array(FixedPlanSchema).min(1),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type UpstashPricing = z.infer<typeof UpstashPricingSchema>;

const FACT_PATH = knowledgePath("upstash.json");

let cached: UpstashPricing | undefined;

/** Load + validate the Upstash pricing facts (cached). */
export function loadUpstashPricing(): UpstashPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = UpstashPricingSchema.parse(raw);
  return cached;
}
