import { z } from "zod";

// ------------------------------------------------------------------
// Projects list
// ------------------------------------------------------------------

export const NeonProjectItemSchema = z.object({
  id: z.string(),
  name: z.string(),
}).passthrough();

export const NeonProjectsListSchema = z.object({
  projects: z.array(NeonProjectItemSchema),
});

export type NeonProjectItem = z.infer<typeof NeonProjectItemSchema>;
export type NeonProjectsList = z.infer<typeof NeonProjectsListSchema>;

// ------------------------------------------------------------------
// Branches
// ------------------------------------------------------------------

export const NeonBranchItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  default: z.boolean().nullish(),
}).passthrough();

export const NeonBranchesResponseSchema = z.object({
  branches: z.array(NeonBranchItemSchema),
});

export type NeonBranchItem = z.infer<typeof NeonBranchItemSchema>;

// ------------------------------------------------------------------
// Per-project consumption (compute_time_seconds)
// ------------------------------------------------------------------

export const NeonProjectDetailSchema = z.object({
  compute_time_seconds: z.number().nullish(),
}).passthrough();

export type NeonProjectDetail = z.infer<typeof NeonProjectDetailSchema>;

// ------------------------------------------------------------------
// Active entry schema
// ------------------------------------------------------------------

export const NeonActiveSchema = z.object({
  projects: z.array(z.string()),
  branches: z.array(z.string()).optional(),
});

export type NeonActive = z.infer<typeof NeonActiveSchema>;
