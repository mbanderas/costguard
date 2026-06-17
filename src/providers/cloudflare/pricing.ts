import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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

// knowledge/cloudflare.json sits at the repo/package root. This module compiles
// to dist/providers/cloudflare/pricing.js and runs from src/providers/cloudflare
// via tsx; both are three levels below the root, so the path resolves in either.
const here = path.dirname(fileURLToPath(import.meta.url));
const FACT_PATH = path.join(here, "..", "..", "..", "knowledge", "cloudflare.json");

let cached: CloudflarePricing | undefined;

/** Load + validate the Cloudflare pricing facts (cached). */
export function loadCloudflarePricing(): CloudflarePricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = CloudflarePricingSchema.parse(raw);
  return cached;
}
