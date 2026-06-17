import { z } from "zod";

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.datadog). Datadog is
// declaration-only (see index.ts): the operator declares the APM host counts
// because the live usage API needs dual-key auth the fetcher cannot supply.
// ------------------------------------------------------------------

export const DatadogActiveSchema = z.object({
  plan: z.enum(["pro", "enterprise"]),
  apmHostsActive: z.number().nonnegative(),
  apmHostsNeeded: z.number().nonnegative(),
});

export type DatadogActive = z.infer<typeof DatadogActiveSchema>;
