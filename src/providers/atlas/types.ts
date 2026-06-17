import { z } from "zod";

// ------------------------------------------------------------------
// Atlas Admin API response shape (cluster list). Tolerant: the tier may live
// under providerSettings.instanceSizeName (classic) or a flat field. Field
// names are sourced-but-not-live-verified (R8).
// ------------------------------------------------------------------

export const AtlasClustersSchema = z.object({
  results: z.array(
    z.object({
      name: z.string(),
      instanceSizeName: z.string().optional(),
      providerSettings: z.object({ instanceSizeName: z.string() }).nullish(),
    }),
  ),
});

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.atlas). The operator
// declares each cluster's environment and logical data size; the live tier is
// fetched from the API and reconciled against it (mirrors the supabase module).
// ------------------------------------------------------------------

export const AtlasActiveSchema = z.object({
  projectId: z.string(),
  clusters: z.array(
    z.object({
      name: z.string(),
      env: z.string(),
      dataSizeGb: z.number().nonnegative(),
    }),
  ),
});

export type AtlasActive = z.infer<typeof AtlasActiveSchema>;
