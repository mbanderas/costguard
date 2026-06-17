import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { VercelActiveSchema } from "./types.js";
import { fetchSeatUsage } from "./api.js";
import { reconcileVercel, type NormalizedVercelUsage } from "./reconcile.js";

const TOKEN_ENV_VARS = ["VERCEL_TOKEN", "VERCEL_API_TOKEN"] as const;

export const vercelModule: ProviderModule = {
  id: "vercel",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["vercel"];
    if (rawActive === undefined) return [];

    const parsed = VercelActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid vercel active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const seats = await fetchSeatUsage(args.fetcher, active.teamId);

    const usage: NormalizedVercelUsage = {
      plan: active.plan ?? "pro",
      paidDeployingSeats: seats.paidDeployingSeats,
      activeDeployingSeats: seats.activeDeployingSeats,
    };
    return reconcileVercel({ usage, workspace: args.ctx.workspace });
  },
};
