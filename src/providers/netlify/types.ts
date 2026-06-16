import { z } from "zod";

// ------------------------------------------------------------------
// Netlify REST API response shapes (tolerant — nullish on optional fields)
// ------------------------------------------------------------------

export const NetlifySiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  account_slug: z.string().nullish(),
});

export const NetlifySitesListSchema = z.array(NetlifySiteSchema);

export const NetlifyBandwidthSchema = z.object({
  used: z.number(),
  included: z.number(),
});

export const NetlifyBuildUsageSchema = z.object({
  used: z.number(),
  included: z.number(),
});

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.netlify)
// ------------------------------------------------------------------

export const NetlifyActiveSchema = z.object({
  sites: z.array(z.string()),
  accountSlug: z.string().optional(),
});

export type NetlifyActive = z.infer<typeof NetlifyActiveSchema>;
