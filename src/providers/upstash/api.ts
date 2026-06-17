import type { HttpFetcher } from "../types.js";
import { UpstashStatsSchema } from "./types.js";

const BASE_URL = "https://api.upstash.com/v2";

const BYTES_PER_GB = 1_000_000_000;

export interface NormalizedUpstashStats {
  monthlyCommands: number;
  storageGb: number;
}

/**
 * Fetch per-database command count + storage size from the Upstash management
 * API and normalize storage bytes to GB.
 */
export async function fetchDatabaseStats(
  fetcher: HttpFetcher,
  databaseId: string,
): Promise<NormalizedUpstashStats> {
  const res = await fetcher(`${BASE_URL}/redis/stats/${databaseId}`);
  if (!res.ok) {
    throw new Error(`fetchDatabaseStats(${databaseId}) failed: HTTP ${res.status}`);
  }
  const parsed = UpstashStatsSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`fetchDatabaseStats(${databaseId}) parse error: ${parsed.error.message}`);
  }
  return {
    monthlyCommands: parsed.data.command_count,
    storageGb: parsed.data.db_size / BYTES_PER_GB,
  };
}
