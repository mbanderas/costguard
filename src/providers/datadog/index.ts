import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { DatadogActiveSchema } from "./types.js";
import { reconcileDatadog } from "./reconcile.js";

const TOKEN_ENV_VARS = ["DD_API_KEY", "DATADOG_API_KEY"] as const;

// NOTE: Datadog is declaration-only. The live host-count usage API requires
// dual-key auth (DD-API-KEY + DD-APPLICATION-KEY headers), which the GET-only,
// single-Bearer-token HttpFetcher and the env-less ProviderCheckArgs cannot
// supply (see checkpoint R13). Until the fetcher gains multi-header/multi-key
// support, the operator declares the APM host counts in active.datadog and the
// reconcile runs offline against the sourced rates — no network call is made.
export const datadogModule: ProviderModule = {
  id: "datadog",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  // check is async to satisfy the ProviderModule contract; declaration-only,
  // so it resolves immediately without a network round-trip.
  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["datadog"];
    if (rawActive === undefined) return [];

    const parsed = DatadogActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid datadog active config: ${parsed.error.message}`);
    }

    return reconcileDatadog({ usage: parsed.data, workspace: args.ctx.workspace });
  },
};
