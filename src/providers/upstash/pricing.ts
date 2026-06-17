import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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

// knowledge/upstash.json sits at the repo/package root. This module compiles to
// dist/providers/upstash/pricing.js and runs from src/providers/upstash via tsx;
// both are three levels below the root, so the same relative path resolves.
const here = path.dirname(fileURLToPath(import.meta.url));
const FACT_PATH = path.join(here, "..", "..", "..", "knowledge", "upstash.json");

let cached: UpstashPricing | undefined;

/** Load + validate the Upstash pricing facts (cached). */
export function loadUpstashPricing(): UpstashPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = UpstashPricingSchema.parse(raw);
  return cached;
}
