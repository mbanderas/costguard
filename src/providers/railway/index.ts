import type { ProviderModule, ProviderCheckArgs, GraphqlClient } from "../types.js";
import type { Finding } from "../../types.js";
import { makeLiveGraphqlClient } from "../fetcher.js";
import { tokenFromEnv } from "../types.js";
import { RAILWAY_GRAPHQL_URL, RailwayActiveSchema } from "./types.js";
import { fetchProjects, fetchServices, fetchUsage } from "./api.js";
import { reconcileRailway } from "./reconcile.js";

export async function runRailwayCheck(
  args: ProviderCheckArgs,
  client: GraphqlClient,
): Promise<Finding[]> {
  const rawActive = args.entry.active["railway"];

  if (rawActive === undefined || rawActive === null) {
    return [];
  }

  const parsed = RailwayActiveSchema.safeParse(rawActive);
  if (!parsed.success) {
    throw new Error(
      `Invalid active.railway config: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  const active = parsed.data;

  const projects = await fetchProjects(client);
  const findings: Finding[] = [];

  for (const project of projects) {
    const { services, deployments } = await fetchServices(client, project.id);
    const estimatedUsage = await fetchUsage(client, project.id);

    const projectFindings = reconcileRailway({
      projectName: project.name,
      services,
      deployments,
      estimatedUsage,
      active,
      config: args.config,
      workspace: args.ctx.workspace,
    });

    findings.push(...projectFindings);
  }

  return findings;
}

export const railwayModule: ProviderModule = {
  id: "railway",
  tokenEnvVars: ["RAILWAY_TOKEN", "RAILWAY_API_TOKEN"],

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, this.tokenEnvVars) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, this.tokenEnvVars);
  },

  check(args: ProviderCheckArgs): Promise<Finding[]> {
    const token = this.resolveToken(process.env) ?? "";
    const client = makeLiveGraphqlClient(token, RAILWAY_GRAPHQL_URL);
    return runRailwayCheck(args, client);
  },
};
