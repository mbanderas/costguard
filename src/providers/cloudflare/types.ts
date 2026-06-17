import { z } from "zod";

// ------------------------------------------------------------------
// Cloudflare API response shape (R2 bucket list). Tolerant.
// ------------------------------------------------------------------

export const CloudflareBucketsSchema = z.object({
  result: z.object({
    buckets: z.array(z.object({ name: z.string() })),
  }),
});

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.cloudflare). The operator
// declares R2 usage (R2 op/storage metrics come from the GraphQL analytics API,
// which the GET-only fetcher abstraction does not cover); the live REST call
// confirms buckets exist. Mirrors the atlas operator-declared pattern.
// ------------------------------------------------------------------

export const CloudflareActiveSchema = z.object({
  accountId: z.string(),
  r2: z.object({
    storageGb: z.number().nonnegative(),
    classAOps: z.number().nonnegative(),
    classBOps: z.number().nonnegative(),
  }),
});

export type CloudflareActive = z.infer<typeof CloudflareActiveSchema>;
