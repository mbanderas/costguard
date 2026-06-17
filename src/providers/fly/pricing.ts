import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// ------------------------------------------------------------------
// Sourced Fly.io cost facts, loaded from the versioned knowledge fact file
// (knowledge/fly.json). The reconcile reads rates from here instead of
// hardcoding. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const FlyPricingSchema = z.object({
  provider: z.literal("fly"),
  updated: z.string(),
  dedicatedIpv4UsdPerMonth: z.number().nonnegative(),
  outboundUsdPerGb: z.number().nonnegative(),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type FlyPricing = z.infer<typeof FlyPricingSchema>;

const FACT_PATH = knowledgePath("fly.json");

let cached: FlyPricing | undefined;

/** Load + validate the Fly.io pricing facts (cached). */
export function loadFlyPricing(): FlyPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = FlyPricingSchema.parse(raw);
  return cached;
}
