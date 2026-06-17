import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { UpstashActiveSchema } from "./types.js";
import { fetchDatabaseStats } from "./api.js";
import { reconcileUpstash, type NormalizedUpstashUsage } from "./reconcile.js";

const TOKEN_ENV_VARS = ["UPSTASH_API_KEY", "UPSTASH_TOKEN"] as const;

export const upstashModule: ProviderModule = {
  id: "upstash",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["upstash"];
    if (rawActive === undefined) return [];

    const parsed = UpstashActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid upstash active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const stats = await fetchDatabaseStats(args.fetcher, active.databaseId);

    const usage: NormalizedUpstashUsage = {
      plan: active.plan,
      monthlyCommands: stats.monthlyCommands,
      storageGb: stats.storageGb,
    };
    return reconcileUpstash({ usage, workspace: args.ctx.workspace });
  },
};
