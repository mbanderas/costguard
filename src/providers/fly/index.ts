import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { FlyActiveSchema } from "./types.js";
import { fetchAppNames } from "./api.js";
import { reconcileFly, type NormalizedFlyApp } from "./reconcile.js";

const TOKEN_ENV_VARS = ["FLY_API_TOKEN", "FLY_ACCESS_TOKEN"] as const;

export const flyModule: ProviderModule = {
  id: "fly",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["fly"];
    if (rawActive === undefined) return [];

    const parsed = FlyActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid fly active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const liveApps = await fetchAppNames(args.fetcher, active.orgSlug);

    const apps: NormalizedFlyApp[] = active.apps
      .filter((a) => liveApps.has(a.name))
      .map((a) => ({
        name: a.name,
        dedicatedIpv4Count: a.dedicatedIpv4Count,
        critical: a.critical,
      }));

    return reconcileFly({ apps, workspace: args.ctx.workspace });
  },
};
