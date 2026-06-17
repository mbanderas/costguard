import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { RenderActiveSchema } from "./types.js";
import { fetchServicePlans } from "./api.js";
import { reconcileRender, type NormalizedRenderService } from "./reconcile.js";

const TOKEN_ENV_VARS = ["RENDER_API_KEY", "RENDER_TOKEN"] as const;

export const renderModule: ProviderModule = {
  id: "render",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["render"];
    if (rawActive === undefined) return [];

    const parsed = RenderActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid render active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const plans = await fetchServicePlans(args.fetcher);

    const services: NormalizedRenderService[] = [];
    for (const decl of active.services) {
      const plan = plans.get(decl.name);
      if (plan === undefined) continue; // declared service not found live — skip
      services.push({ name: decl.name, plan, env: decl.env });
    }

    return reconcileRender({ services, workspace: args.ctx.workspace });
  },
};
