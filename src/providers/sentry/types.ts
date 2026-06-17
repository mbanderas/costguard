import { z } from "zod";

// ------------------------------------------------------------------
// Sentry REST API response shapes (stats_v2 organization usage)
// ------------------------------------------------------------------

export const SentryStatsSchema = z.object({
  groups: z.array(
    z.object({
      totals: z.object({ "sum(quantity)": z.number() }),
    }),
  ),
});

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.sentry)
// ------------------------------------------------------------------

export const SentryActiveSchema = z.object({
  orgSlug: z.string(),
  plan: z.enum(["developer", "team", "business"]).optional(),
});

export type SentryActive = z.infer<typeof SentryActiveSchema>;
