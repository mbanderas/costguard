import type { GraphqlClient } from "../types.js";
import {
  RailwayProjectsResponseSchema,
  RailwayServicesResponseSchema,
  RailwayUsageResponseSchema,
} from "./types.js";

// ------------------------------------------------------------------
// Query constants — READ-ONLY; no mutations.
// ------------------------------------------------------------------

export const Q_PROJECTS =
  "query CostguardProjects { me { projects { edges { node { id name } } } } }";

export const Q_SERVICES = `query CostguardServices($projectId: String!) {
  project(id: $projectId) {
    services { edges { node { id name updatedAt } } }
    deployments { edges { node { id status createdAt } } }
  }
}`;

export const Q_USAGE = `query CostguardUsage($projectId: String!) {
  project(id: $projectId) {
    estimatedUsage
  }
}`;

// ------------------------------------------------------------------
// Normalized read wrappers
// ------------------------------------------------------------------

export async function fetchProjects(
  client: GraphqlClient,
): Promise<Array<{ id: string; name: string }>> {
  const raw = await client.query<unknown>(Q_PROJECTS);
  const parsed = RailwayProjectsResponseSchema.parse(raw);
  return parsed.me.projects.edges.map((e) => e.node);
}

export async function fetchServices(
  client: GraphqlClient,
  projectId: string,
): Promise<{
  services: Array<{ id: string; name: string; updatedAt: string | null }>;
  deployments: Array<{ id: string; status: string; createdAt: string | null }>;
}> {
  const raw = await client.query<unknown>(Q_SERVICES, { projectId });
  const parsed = RailwayServicesResponseSchema.parse(raw);
  return {
    services: parsed.project.services.edges.map((e) => ({
      id: e.node.id,
      name: e.node.name,
      updatedAt: e.node.updatedAt ?? null,
    })),
    deployments: parsed.project.deployments.edges.map((e) => ({
      id: e.node.id,
      status: e.node.status,
      createdAt: e.node.createdAt ?? null,
    })),
  };
}

export async function fetchUsage(
  client: GraphqlClient,
  projectId: string,
): Promise<number> {
  const raw = await client.query<unknown>(Q_USAGE, { projectId });
  const parsed = RailwayUsageResponseSchema.parse(raw);
  return parsed.project.estimatedUsage ?? 0;
}
