import type { ProviderModule } from "./types.js";
import { githubModule } from "./github/index.js";
import { supabaseModule } from "./supabase/index.js";

// ------------------------------------------------------------------
// Provider module registry
// ------------------------------------------------------------------

export const PROVIDER_MODULES: Readonly<Record<string, ProviderModule>> = {
  github: githubModule,
  supabase: supabaseModule,
};

export function getProviderModule(id: string): ProviderModule | undefined {
  return PROVIDER_MODULES[id];
}

/**
 * Intersects the requested provider ids (or all known) with the entry's
 * declared providers, keeping only those whose module exists AND is enabled
 * in the current environment.
 *
 * @param ids     - explicit list of provider ids, or "all" to use all known modules
 * @param entryProviders - providers declared on the workspace entry
 * @param env     - process.env (or a subset thereof)
 * @returns sorted, unique provider ids that are present, registered, and enabled
 */
export function enabledProviderIds(
  ids: string[] | "all",
  entryProviders: string[],
  env: NodeJS.ProcessEnv,
): string[] {
  const candidates = ids === "all" ? Object.keys(PROVIDER_MODULES) : ids;
  const entrySet = new Set(entryProviders);

  const enabled = candidates.filter((id) => {
    if (!entrySet.has(id)) return false;
    const mod = PROVIDER_MODULES[id];
    if (mod === undefined) return false;
    return mod.isEnabled(env);
  });

  return [...new Set(enabled)].sort();
}
