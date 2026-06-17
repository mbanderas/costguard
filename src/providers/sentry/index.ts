import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { SentryActiveSchema } from "./types.js";
import { fetchErrorEvents } from "./api.js";
import { reconcileSentry, type NormalizedSentryUsage } from "./reconcile.js";

const TOKEN_ENV_VARS = ["SENTRY_AUTH_TOKEN", "SENTRY_TOKEN"] as const;

export const sentryModule: ProviderModule = {
  id: "sentry",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["sentry"];
    if (rawActive === undefined) return [];

    const parsed = SentryActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid sentry active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const monthlyErrorEvents = await fetchErrorEvents(args.fetcher, active.orgSlug);

    // Default to the Team quota (50k) when the plan is unspecified, so an
    // unknown plan does not over-report overage against the tiny free quota.
    const usage: NormalizedSentryUsage = {
      plan: active.plan ?? "team",
      monthlyErrorEvents,
    };
    return reconcileSentry({ usage, workspace: args.ctx.workspace });
  },
};
