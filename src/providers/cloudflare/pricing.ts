import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// ------------------------------------------------------------------
// Sourced Cloudflare R2 economics, loaded from the versioned knowledge fact
// file (knowledge/cloudflare.json). The reconcile reads rates from here instead
// of hardcoding. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const R2Schema = z.object({
  storageUsdPerGbMonth: z.number().nonnegative(),
  freeStorageGb: z.number().nonnegative(),
  classAUsdPerMillion: z.number().nonnegative(),
  freeClassAOps: z.number().nonnegative(),
  classBUsdPerMillion: z.number().nonnegative(),
  freeClassBOps: z.number().nonnegative(),
});

const CloudflarePricingSchema = z.object({
  provider: z.literal("cloudflare"),
  updated: z.string(),
  r2: R2Schema,
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type CloudflarePricing = z.infer<typeof CloudflarePricingSchema>;

const FACT_PATH = knowledgePath("cloudflare.json");

let cached: CloudflarePricing | undefined;

/** Load + validate the Cloudflare pricing facts (cached). */
export function loadCloudflarePricing(): CloudflarePricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = CloudflarePricingSchema.parse(raw);
  return cached;
}
