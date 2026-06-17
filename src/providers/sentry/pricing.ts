import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// ------------------------------------------------------------------
// Sourced Sentry plan economics, loaded from the versioned knowledge fact
// file (knowledge/sentry.json). The reconcile reads rates from here instead
// of hardcoding. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const PlanSchema = z.object({
  monthlyUsd: z.number().nonnegative(),
  includedErrors: z.number().nonnegative(),
});

const SentryPricingSchema = z.object({
  provider: z.literal("sentry"),
  updated: z.string(),
  plans: z.object({
    developer: PlanSchema,
    team: PlanSchema,
    business: PlanSchema,
  }),
  errorOverageUsdPerEvent: z.number().nonnegative(),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type SentryPricing = z.infer<typeof SentryPricingSchema>;
export type SentryPlanId = "developer" | "team" | "business";

// knowledge/sentry.json sits at the repo/package root. This module compiles to
// dist/providers/sentry/pricing.js and runs from src/providers/sentry via tsx;
// both are three levels below the root, so the same relative path resolves.
const here = path.dirname(fileURLToPath(import.meta.url));
const FACT_PATH = path.join(here, "..", "..", "..", "knowledge", "sentry.json");

let cached: SentryPricing | undefined;

/** Load + validate the Sentry pricing facts (cached). */
export function loadSentryPricing(): SentryPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = SentryPricingSchema.parse(raw);
  return cached;
}
