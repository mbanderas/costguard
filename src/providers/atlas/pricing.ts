import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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

// knowledge/atlas.json sits at the repo/package root. This module compiles to
// dist/providers/atlas/pricing.js and runs from src/providers/atlas via tsx;
// both are three levels below the root, so the same relative path resolves.
const here = path.dirname(fileURLToPath(import.meta.url));
const FACT_PATH = path.join(here, "..", "..", "..", "knowledge", "atlas.json");

let cached: AtlasPricing | undefined;

/** Load + validate the Atlas pricing facts (cached). */
export function loadAtlasPricing(): AtlasPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = AtlasPricingSchema.parse(raw);
  return cached;
}
