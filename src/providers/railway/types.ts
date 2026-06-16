import { z } from "zod";

export const RAILWAY_GRAPHQL_URL = "https://backboard.railway.com/graphql/v2";

// ------------------------------------------------------------------
// Projects query response
// ------------------------------------------------------------------

export const RailwayProjectNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const RailwayProjectsResponseSchema = z.object({
  me: z.object({
    projects: z.object({
      edges: z.array(
        z.object({ node: RailwayProjectNodeSchema }),
      ),
    }),
  }),
});

export type RailwayProjectsResponse = z.infer<typeof RailwayProjectsResponseSchema>;

// ------------------------------------------------------------------
// Services query response (per project)
// ------------------------------------------------------------------

export const RailwayServiceNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string().nullish(),
});

export const RailwayDeploymentNodeSchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.string().nullish(),
});

export const RailwayServicesResponseSchema = z.object({
  project: z.object({
    services: z.object({
      edges: z.array(z.object({ node: RailwayServiceNodeSchema })),
    }),
    deployments: z.object({
      edges: z.array(z.object({ node: RailwayDeploymentNodeSchema })),
    }),
  }),
});

export type RailwayServicesResponse = z.infer<typeof RailwayServicesResponseSchema>;

// ------------------------------------------------------------------
// Usage query response (per project)
// ------------------------------------------------------------------

export const RailwayUsageResponseSchema = z.object({
  project: z.object({
    estimatedUsage: z.number().nullish(),
  }),
});

export type RailwayUsageResponse = z.infer<typeof RailwayUsageResponseSchema>;

// ------------------------------------------------------------------
// Active config schema (from workspaces.json active.railway)
// ------------------------------------------------------------------

export const RailwayActiveSchema = z.object({
  services: z.array(z.string()),
  idleDays: z.number().optional(),
});

export type RailwayActive = z.infer<typeof RailwayActiveSchema>;
