import { z } from "zod";

// ------------------------------------------------------------------
// Projects list item schema
// ------------------------------------------------------------------

export const ProjectItemSchema = z.object({
  ref: z.string().optional(),
  id: z.string().optional(),
  name: z.string(),
  status: z.string().optional(),
}).passthrough();

export type ProjectItem = z.infer<typeof ProjectItemSchema>;

export const ProjectsListSchema = z.array(ProjectItemSchema);

// ------------------------------------------------------------------
// Addons response schema
// ------------------------------------------------------------------

const AddonVariantSchema = z.object({
  identifier: z.string().optional(),
  name: z.string().optional(),
}).passthrough();

const SelectedAddonSchema = z.object({
  type: z.string().optional(),
  variant: AddonVariantSchema.optional(),
}).passthrough();

export const AddonsResponseSchema = z.object({
  selected_addons: z.array(SelectedAddonSchema).optional(),
}).passthrough();

export type AddonsResponse = z.infer<typeof AddonsResponseSchema>;

/**
 * Normalizes a compute tier identifier to a bare lowercase tier word.
 * e.g. "ci_small" -> "small", "Small" -> "small"
 */
export function normalizeComputeTier(raw: string): string {
  const lower = raw.toLowerCase();
  // Strip common prefixes like "ci_"
  const stripped = lower.replace(/^(ci_|addon_|compute_)/, "");
  return stripped;
}

/**
 * Derives computeSize and pitrEnabled from a parsed AddonsResponse.
 */
export function deriveComputeInfo(addons: AddonsResponse): {
  computeSize: string;
  pitrEnabled: boolean;
} {
  const selected = addons.selected_addons ?? [];

  const computeAddon = selected.find(
    (a) => a.type !== undefined && a.type.toLowerCase().includes("compute"),
  );

  const pitrAddon = selected.find(
    (a) => a.type !== undefined && a.type.toLowerCase().includes("pitr"),
  );

  const rawTier =
    computeAddon?.variant?.identifier ??
    computeAddon?.variant?.name;

  const computeSize =
    rawTier !== undefined ? normalizeComputeTier(rawTier) : "micro";

  return {
    computeSize,
    pitrEnabled: pitrAddon !== undefined,
  };
}

// ------------------------------------------------------------------
// Branches list schema
// ------------------------------------------------------------------

export const BranchItemSchema = z.object({
  name: z.string(),
  is_default: z.boolean().optional(),
  git_branch: z.string().optional(),
}).passthrough();

export const BranchesListSchema = z.array(BranchItemSchema);

export type BranchItem = z.infer<typeof BranchItemSchema>;

// ------------------------------------------------------------------
// Active entry schema
// ------------------------------------------------------------------

export const SupabaseActiveSchema = z.object({
  projects: z.array(z.string()),
  compute: z.string().optional(),
  pitr: z.boolean().optional(),
  branches: z.array(z.string()).optional(),
});

export type SupabaseActive = z.infer<typeof SupabaseActiveSchema>;
