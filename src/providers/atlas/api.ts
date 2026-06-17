import type { HttpFetcher } from "../types.js";
import { AtlasClustersSchema } from "./types.js";

const BASE_URL = "https://cloud.mongodb.com/api/atlas/v2";

/**
 * Fetch the live tier (instance size) of each cluster in an Atlas project,
 * keyed by cluster name. Tolerant of the classic providerSettings shape and a
 * flat instanceSizeName.
 */
export async function fetchClusterTiers(
  fetcher: HttpFetcher,
  projectId: string,
): Promise<Map<string, string>> {
  const res = await fetcher(`${BASE_URL}/groups/${projectId}/clusters`);
  if (!res.ok) {
    throw new Error(`fetchClusterTiers(${projectId}) failed: HTTP ${res.status}`);
  }
  const parsed = AtlasClustersSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`fetchClusterTiers(${projectId}) parse error: ${parsed.error.message}`);
  }

  const tiers = new Map<string, string>();
  for (const c of parsed.data.results) {
    const tier = c.providerSettings?.instanceSizeName ?? c.instanceSizeName;
    if (tier !== undefined) tiers.set(c.name, tier);
  }
  return tiers;
}
