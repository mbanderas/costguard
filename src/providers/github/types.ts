import { z } from "zod";

// ------------------------------------------------------------------
// GitHub Usage API response schema
// ------------------------------------------------------------------

export const UsageItemSchema = z.object({
  product: z.string(),
  sku: z.string().nullish(),
  quantity: z.number(),
  unitType: z.string().nullish(),
  netAmount: z.number(),
  repositoryName: z.string().nullish(),
  organizationName: z.string().nullish(),
});

export const UsageResponseSchema = z.object({
  usageItems: z.array(UsageItemSchema),
});

export type UsageItem = z.infer<typeof UsageItemSchema>;
export type UsageResponse = z.infer<typeof UsageResponseSchema>;

// ------------------------------------------------------------------
// Active entry schema for github provider
// ------------------------------------------------------------------

export const GithubActiveSchema = z.object({
  repo: z.string(),
  ownerType: z.enum(["user", "org"]).optional(),
  minutesBudget: z.number().optional(),
});

export type GithubActive = z.infer<typeof GithubActiveSchema>;
