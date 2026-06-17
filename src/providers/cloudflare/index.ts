import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { CloudflareActiveSchema } from "./types.js";
import { fetchR2BucketCount } from "./api.js";
import { reconcileCloudflare, type NormalizedR2Usage } from "./reconcile.js";

const TOKEN_ENV_VARS = ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"] as const;

export const cloudflareModule: ProviderModule = {
  id: "cloudflare",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["cloudflare"];
    if (rawActive === undefined) return [];

    const parsed = CloudflareActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid cloudflare active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const bucketCount = await fetchR2BucketCount(args.fetcher, active.accountId);
    if (bucketCount === 0) return [];

    const usage: NormalizedR2Usage = {
      storageGb: active.r2.storageGb,
      classAOps: active.r2.classAOps,
      classBOps: active.r2.classBOps,
    };
    return reconcileCloudflare({ usage, workspace: args.ctx.workspace });
  },
};
