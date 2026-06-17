import type { HttpFetcher } from "../types.js";
import { FlyAppsSchema } from "./types.js";

const BASE_URL = "https://api.machines.dev/v1";

/** Fetch the set of app names in a Fly org (confirms declared apps exist). */
export async function fetchAppNames(
  fetcher: HttpFetcher,
  orgSlug: string,
): Promise<Set<string>> {
  const res = await fetcher(`${BASE_URL}/apps?org_slug=${orgSlug}`);
  if (!res.ok) {
    throw new Error(`fetchAppNames(${orgSlug}) failed: HTTP ${res.status}`);
  }
  const parsed = FlyAppsSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`fetchAppNames(${orgSlug}) parse error: ${parsed.error.message}`);
  }
  return new Set(parsed.data.apps.map((a) => a.name));
}
