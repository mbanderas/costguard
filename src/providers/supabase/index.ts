import type { ProviderModule, ProviderCheckArgs } from "../types.js";
import type { Finding } from "../../types.js";
import { tokenFromEnv } from "../types.js";
import { SupabaseActiveSchema } from "./types.js";
import { fetchProjects, fetchCompute, fetchBranches } from "./api.js";
import { reconcileSupabase } from "./reconcile.js";

const TOKEN_ENV_VARS = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_TOKEN"] as const;

export const supabaseModule: ProviderModule = {
  id: "supabase",
  tokenEnvVars: TOKEN_ENV_VARS,

  isEnabled(env: NodeJS.ProcessEnv): boolean {
    return tokenFromEnv(env, TOKEN_ENV_VARS) !== undefined;
  },

  resolveToken(env: NodeJS.ProcessEnv): string | undefined {
    return tokenFromEnv(env, TOKEN_ENV_VARS);
  },

  async check(args: ProviderCheckArgs): Promise<Finding[]> {
    const rawActive = args.entry.active["supabase"];
    if (rawActive === undefined) return [];

    const parsed = SupabaseActiveSchema.safeParse(rawActive);
    if (!parsed.success) {
      throw new Error(`Invalid supabase active config: ${parsed.error.message}`);
    }

    const active = parsed.data;
    const { fetcher, config, ctx } = args;

    const projects = await fetchProjects(fetcher);

    // Fetch compute/branches only for LIVE refs — reconcile only reads those.
    // A declared ref that is no longer live just yields no finding (resource
    // gone = no leak); fetching it would 404 and sink the whole run.
    const liveRefs = new Set(projects.map((p) => p.ref));

    const computeByRef: Record<string, { computeSize: string; pitrEnabled: boolean }> = {};
    const branchesByRef: Record<string, Array<{ name: string; isDefault: boolean }>> = {};

    await Promise.all(
      [...liveRefs].map(async (ref) => {
        const [compute, branches] = await Promise.all([
          fetchCompute(fetcher, ref),
          fetchBranches(fetcher, ref),
        ]);
        computeByRef[ref] = compute;
        branchesByRef[ref] = branches;
      }),
    );

    return reconcileSupabase({
      projects,
      computeByRef,
      branchesByRef,
      active,
      config,
      workspace: ctx.workspace,
    });
  },
};
