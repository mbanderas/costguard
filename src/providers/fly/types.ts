import { z } from "zod";

// ------------------------------------------------------------------
// Fly Machines API response shape (app list). Tolerant.
// ------------------------------------------------------------------

export const FlyAppsSchema = z.object({
  apps: z.array(z.object({ name: z.string() })),
});

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.fly). The operator declares
// each app's dedicated-IPv4 count and criticality (IP allocations come from the
// Fly GraphQL API, which the GET-only fetcher does not cover); the live REST
// call confirms the app exists. Mirrors the atlas operator-declared pattern.
// ------------------------------------------------------------------

export const FlyActiveSchema = z.object({
  orgSlug: z.string(),
  apps: z.array(
    z.object({
      name: z.string(),
      dedicatedIpv4Count: z.number().nonnegative(),
      critical: z.boolean(),
    }),
  ),
});

export type FlyActive = z.infer<typeof FlyActiveSchema>;
