import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { NetlifyActiveSchema } from "./types.js";
import { fetchSites, fetchBandwidth, fetchBuildUsage } from "./api.js";
import { reconcileNetlify } from "./reconcile.js";

const TOKEN_ENV_VARS = ["NETLIFY_AUTH_TOKEN", "NETLIFY_TOKEN"] as const;

export const netlifyModule: ProviderModule = {
  id: "netlify",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["netlify"];
    if (rawActive === undefined) return [];

    const parsed = NetlifyActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid netlify active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const { fetcher, config, ctx } = args;

    const sites = await fetchSites(fetcher);

    let bandwidth: Awaited<ReturnType<typeof fetchBandwidth>> | undefined;
    let build: Awaited<ReturnType<typeof fetchBuildUsage>> | undefined;

    if (active.accountSlug !== undefined) {
      [bandwidth, build] = await Promise.all([
        fetchBandwidth(fetcher, active.accountSlug),
        fetchBuildUsage(fetcher, active.accountSlug),
      ]);
    }

    const reconcileArgs: Parameters<typeof reconcileNetlify>[0] = {
      sites,
      active,
      config,
      workspace: ctx.workspace,
    };
    if (bandwidth !== undefined) reconcileArgs.bandwidth = bandwidth;
    if (build !== undefined) reconcileArgs.build = build;
    return reconcileNetlify(reconcileArgs);
  },
};
