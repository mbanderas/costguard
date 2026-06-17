import type { HttpFetcher } from "../types.js";
import { SentryStatsSchema } from "./types.js";

const BASE_URL = "https://sentry.io/api/0";

/**
 * Fetch total error events ingested by an organization over the last 30 days
 * via the stats_v2 endpoint, summed across all returned groups.
 */
export async function fetchErrorEvents(
  fetcher: HttpFetcher,
  orgSlug: string,
): Promise<number> {
  const url =
    `${BASE_URL}/organizations/${orgSlug}/stats_v2/` +
    `?field=sum(quantity)&category=error&statsPeriod=30d&interval=1d`;
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`fetchErrorEvents(${orgSlug}) failed: HTTP ${res.status}`);
  }
  const parsed = SentryStatsSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`fetchErrorEvents(${orgSlug}) parse error: ${parsed.error.message}`);
  }
  return parsed.data.groups.reduce((sum, g) => sum + g.totals["sum(quantity)"], 0);
}
