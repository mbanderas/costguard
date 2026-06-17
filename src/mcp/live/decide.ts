import { getProviderModule } from "../../providers/registry.js";

export interface LiveStrategy {
  /** true => a usable API token is resolvable; prefer the API path, no browser. */
  readonly apiFirst: boolean;
}

/**
 * Decide whether a live check should go API-first or fall back to a browser read.
 * API-first iff a provider module exists AND its API token is resolvable from the
 * environment (`resolveToken(env) !== undefined`) — a deterministic, network-free
 * env-NAME check, NOT a live reachability probe. Otherwise browser-fallback.
 * Matches docs/mcp-architecture.md §4.3.
 */
export function decideLiveStrategy(provider: string, env: NodeJS.ProcessEnv): LiveStrategy {
  const mod = getProviderModule(provider);
  const apiFirst = mod !== undefined && mod.resolveToken(env) !== undefined;
  return { apiFirst };
}
