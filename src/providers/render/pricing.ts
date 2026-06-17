import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// ------------------------------------------------------------------
// Sourced Render compute economics, loaded from the versioned knowledge fact
// file (knowledge/render.json). The reconcile reads plans from here instead of
// hardcoding. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const ComputePlanSchema = z.object({
  name: z.string(),
  monthlyUsd: z.number().nonnegative(),
  vcpu: z.number().nonnegative(),
  ramGb: z.number().nonnegative(),
});

export type RenderPlan = z.infer<typeof ComputePlanSchema>;

const RenderPricingSchema = z.object({
  provider: z.literal("render"),
  updated: z.string(),
  computePlans: z.array(ComputePlanSchema).min(1),
  bandwidthOverageUsdPerGb: z.number().nonnegative(),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type RenderPricing = z.infer<typeof RenderPricingSchema>;

const FACT_PATH = knowledgePath("render.json");

let cached: RenderPricing | undefined;

/** Load + validate the Render pricing facts (cached). */
export function loadRenderPricing(): RenderPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = RenderPricingSchema.parse(raw);
  return cached;
}
