import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// ------------------------------------------------------------------
// Sourced MongoDB Atlas cluster economics, loaded from the versioned knowledge
// fact file (knowledge/atlas.json). The reconcile reads tiers from here instead
// of hardcoding. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const TierSchema = z.object({
  name: z.string(),
  storageGb: z.number().nonnegative(),
  monthlyUsd: z.number().nonnegative(),
  dedicated: z.boolean(),
});

export type AtlasTier = z.infer<typeof TierSchema>;

const AtlasPricingSchema = z.object({
  provider: z.literal("atlas"),
  updated: z.string(),
  hoursPerMonth: z.number().positive(),
  tiers: z.array(TierSchema).min(1),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type AtlasPricing = z.infer<typeof AtlasPricingSchema>;

const FACT_PATH = knowledgePath("atlas.json");

let cached: AtlasPricing | undefined;

/** Load + validate the Atlas pricing facts (cached). */
export function loadAtlasPricing(): AtlasPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = AtlasPricingSchema.parse(raw);
  return cached;
}
