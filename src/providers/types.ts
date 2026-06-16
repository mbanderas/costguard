import type { CheckContext, Finding } from "../types.js";
import type { CostguardConfig } from "../config.js";
import type { WorkspaceEntry } from "../registry/schema.js";

// ------------------------------------------------------------------
// HTTP abstraction (keeps fetch details out of provider modules)
// ------------------------------------------------------------------

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type HttpFetcher = (
  url: string,
  opts?: { headers?: Record<string, string> },
) => Promise<HttpResponse>;

// ------------------------------------------------------------------
// Provider module contract
// ------------------------------------------------------------------

export interface ProviderCheckArgs {
  ctx: CheckContext;
  entry: WorkspaceEntry;
  fetcher: HttpFetcher;
  config: CostguardConfig;
}

export interface ProviderModule {
  readonly id: string;
  readonly tokenEnvVars: readonly string[];
  isEnabled(env: NodeJS.ProcessEnv): boolean;
  resolveToken(env: NodeJS.ProcessEnv): string | undefined;
  check(args: ProviderCheckArgs): Promise<Finding[]>;
}

// ------------------------------------------------------------------
// Shared token helper
// ------------------------------------------------------------------

/** Returns the first non-empty value found in env for any of the given names. */
export function tokenFromEnv(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const val = env[name];
    if (val !== undefined && val.length > 0) return val;
  }
  return undefined;
}
