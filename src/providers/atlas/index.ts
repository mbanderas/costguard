import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { AtlasActiveSchema } from "./types.js";
import { fetchClusterTiers } from "./api.js";
import { reconcileAtlas, type NormalizedAtlasCluster } from "./reconcile.js";

const TOKEN_ENV_VARS = ["ATLAS_API_KEY", "MONGODB_ATLAS_TOKEN"] as const;

export const atlasModule: ProviderModule = {
  id: "atlas",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["atlas"];
    if (rawActive === undefined) return [];

    const parsed = AtlasActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid atlas active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const tiers = await fetchClusterTiers(args.fetcher, active.projectId);

    const clusters: NormalizedAtlasCluster[] = [];
    for (const decl of active.clusters) {
      const tier = tiers.get(decl.name);
      if (tier === undefined) continue; // declared cluster not found live — skip
      clusters.push({ name: decl.name, tier, env: decl.env, dataSizeGb: decl.dataSizeGb });
    }

    return reconcileAtlas({ clusters, workspace: args.ctx.workspace });
  },
};
