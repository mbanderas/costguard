import type { HttpFetcher } from "../types.js";
import { CloudflareBucketsSchema } from "./types.js";

const BASE_URL = "https://api.cloudflare.com/client/v4";

/** Count R2 buckets in an account (confirms R2 is in use before reconciling). */
export async function fetchR2BucketCount(
  fetcher: HttpFetcher,
  accountId: string,
): Promise<number> {
  const res = await fetcher(`${BASE_URL}/accounts/${accountId}/r2/buckets`);
  if (!res.ok) {
    throw new Error(`fetchR2BucketCount(${accountId}) failed: HTTP ${res.status}`);
  }
  const parsed = CloudflareBucketsSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`fetchR2BucketCount(${accountId}) parse error: ${parsed.error.message}`);
  }
  return parsed.data.result.buckets.length;
}
