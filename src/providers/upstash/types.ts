import { z } from "zod";

// ------------------------------------------------------------------
// Upstash management API response shape (per-database stats).
// Field names are sourced-but-not-live-verified (R8): the reconcile math is
// the verified part; the live API contract should be confirmed before relying
// on it for billing decisions.
// ------------------------------------------------------------------

export const UpstashStatsSchema = z.object({
  command_count: z.number().nonnegative(),
  db_size: z.number().nonnegative(), // bytes
});

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.upstash)
// plan is required: it determines whether PAYG-vs-fixed analysis applies.
// ------------------------------------------------------------------

export const UpstashActiveSchema = z.object({
  databaseId: z.string(),
  plan: z.enum(["payg", "fixed"]),
});

export type UpstashActive = z.infer<typeof UpstashActiveSchema>;
