import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// Sourced live-site -> host transfer cost facts (knowledge/site-costs.json). The
// site analyzer reads rates from here instead of hardcoding; every group ships a
// source URL + date in the JSON.

const HostRateSchema = z.object({
  transferUsdPerGb: z.number().nonnegative(),
  billsTransfer: z.boolean(),
  label: z.string(),
});

export type HostRate = z.infer<typeof HostRateSchema>;

const SiteCostsSchema = z.object({
  schemaVersion: z.number(),
  provider: z.literal("site"),
  updated: z.string(),
  currency: z.string(),
  note: z.string().optional(),
  assumedMonthlyVisits: z.number().positive(),
  compressibleSavingsRatio: z.number().min(0).max(1),
  hosts: z.record(z.string(), HostRateSchema),
  thresholds: z.object({
    oversizedImageBytes: z.number().positive(),
    largeTextAssetBytes: z.number().positive(),
    minCacheMaxAgeSeconds: z.number().nonnegative(),
  }),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type SiteCosts = z.infer<typeof SiteCostsSchema>;

const FACT_PATH = knowledgePath("site-costs.json");

let cached: SiteCosts | undefined;

/** Load + validate the site cost facts (cached). */
export function loadSiteCosts(): SiteCosts {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = SiteCostsSchema.parse(raw);
  return cached;
}
