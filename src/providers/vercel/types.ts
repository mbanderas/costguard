import { z } from "zod";

// ------------------------------------------------------------------
// Vercel REST API response shapes (tolerant — nullish on optional fields)
// ------------------------------------------------------------------

export const VercelMembersSchema = z.object({
  members: z.array(
    z.object({
      uid: z.string(),
      role: z.string(),
    }),
  ),
});

export const VercelDeploymentsSchema = z.object({
  deployments: z.array(
    z.object({
      creator: z.object({ uid: z.string() }).nullish(),
    }),
  ),
});

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.vercel)
// ------------------------------------------------------------------

export const VercelActiveSchema = z.object({
  teamId: z.string(),
  plan: z.enum(["pro", "hobby"]).optional(),
});

export type VercelActive = z.infer<typeof VercelActiveSchema>;
