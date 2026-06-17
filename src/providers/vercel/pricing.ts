import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// ------------------------------------------------------------------
// Sourced Vercel plan economics, loaded from the versioned knowledge fact
// file (knowledge/vercel.json). The reconcile reads rates from here instead
// of hardcoding, so prices can be updated without code changes. Every fact
// group ships a source URL in the JSON.
// ------------------------------------------------------------------

const ProPlanSchema = z.object({
  platformFeeUsd: z.number().nonnegative(),
  includedDeployingSeats: z.number().int().nonnegative(),
  additionalSeatUsd: z.number().nonnegative(),
  usageCreditUsd: z.number().nonnegative(),
  includedFastDataTransferGb: z.number().nonnegative(),
  includedEdgeRequests: z.number().nonnegative(),
});

const HobbyPlanSchema = z.object({
  includedCpuHours: z.number().nonnegative(),
  includedProvisionedMemoryGbHours: z.number().nonnegative(),
  includedFunctionInvocations: z.number().nonnegative(),
});

const VercelPricingSchema = z.object({
  provider: z.literal("vercel"),
  updated: z.string(),
  plans: z.object({ pro: ProPlanSchema, hobby: HobbyPlanSchema }),
  buildCpuMinuteUsd: z.number().nonnegative(),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type VercelPricing = z.infer<typeof VercelPricingSchema>;

// knowledge/vercel.json sits at the repo/package root. This module compiles to
// dist/providers/vercel/pricing.js and runs from src/providers/vercel via tsx;
// both are three levels below the root, so the same relative path resolves in
// either layout.
const here = path.dirname(fileURLToPath(import.meta.url));
const FACT_PATH = path.join(here, "..", "..", "..", "knowledge", "vercel.json");

let cached: VercelPricing | undefined;

/** Load + validate the Vercel pricing facts (cached). */
export function loadVercelPricing(): VercelPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = VercelPricingSchema.parse(raw);
  return cached;
}
