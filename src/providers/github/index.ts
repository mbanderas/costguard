import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { GithubActiveSchema } from "./types.js";
import { fetchUsage } from "./api.js";
import { reconcileGithub } from "./reconcile.js";

const TOKEN_ENV_VARS = ["GITHUB_TOKEN", "GH_TOKEN"] as const;

export const githubModule: ProviderModule = {
  id: "github",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["github"];
    if (rawActive === undefined) return [];

    const parsed = GithubActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid github active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const owner = active.repo.split("/")[0];
    if (owner === undefined) {
      throw new Error(`github active.repo must be in "owner/repo" format, got: ${active.repo}`);
    }

    const items = await fetchUsage(args.fetcher, owner, active.ownerType);
    return reconcileGithub(items, active, args.config, args.ctx.workspace);
  },
};
