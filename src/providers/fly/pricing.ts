import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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

// knowledge/fly.json sits at the repo/package root. This module compiles to
// dist/providers/fly/pricing.js and runs from src/providers/fly via tsx; both
// are three levels below the root, so the same relative path resolves.
const here = path.dirname(fileURLToPath(import.meta.url));
const FACT_PATH = path.join(here, "..", "..", "..", "knowledge", "fly.json");

let cached: FlyPricing | undefined;

/** Load + validate the Fly.io pricing facts (cached). */
export function loadFlyPricing(): FlyPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = FlyPricingSchema.parse(raw);
  return cached;
}
