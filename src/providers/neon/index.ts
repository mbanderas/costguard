import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { NeonActiveSchema } from "./types.js";
import { fetchProjects, fetchBranches, fetchComputeHours } from "./api.js";
import { reconcileNeon } from "./reconcile.js";

const TOKEN_ENV_VARS = ["NEON_API_KEY", "NEON_API_TOKEN"] as const;

export const neonModule: ProviderModule = {
  id: "neon",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["neon"];
    if (rawActive === undefined) return [];

    const parsed = NeonActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid neon active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const { fetcher, config, ctx } = args;

    const projects = await fetchProjects(fetcher);
    const declaredSet = new Set(active.projects);

    // Only sub-fetch for projects that are both live AND declared
    const branchesByProject: Record<string, Array<{ id: string; name: string; isDefault: boolean }>> = {};
    const computeHoursByProject: Record<string, number> = {};

    await Promise.all(
      projects
        .filter((p) => declaredSet.has(p.id) || declaredSet.has(p.name))
        .map(async (p) => {
          const [branches, hours] = await Promise.all([
            fetchBranches(fetcher, p.id),
            fetchComputeHours(fetcher, p.id),
          ]);
          branchesByProject[p.id] = branches;
          computeHoursByProject[p.id] = hours;
        }),
    );

    return reconcileNeon({
      projects,
      branchesByProject,
      computeHoursByProject,
      active,
      config,
      workspace: ctx.workspace,
    });
  },
};
