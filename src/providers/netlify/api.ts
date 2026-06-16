import type { HttpFetcher } from "../types.js";
import { NetlifySitesListSchema, NetlifyBandwidthSchema, NetlifyBuildUsageSchema } from "./types.js";

const BASE_URL = "https://api.netlify.com/api/v1";

export interface NormalizedSite {
  id: string;
  name: string;
  accountSlug: string | null;
}

export interface NormalizedBandwidth {
  usedGb: number;
  includedGb: number;
}

export interface NormalizedBuildUsage {
  usedMinutes: number;
  includedMinutes: number;
}

export async function fetchSites(fetcher: HttpFetcher): Promise<NormalizedSite[]> {
  const res = await fetcher(`${BASE_URL}/sites?per_page=100`);
  if (!res.ok) {
    throw new Error(`fetchSites failed: HTTP ${res.status}`);
  }
  const raw = await res.json();
  const parsed = NetlifySitesListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`fetchSites parse error: ${parsed.error.message}`);
  }
  return parsed.data.map((s) => ({
    id: s.id,
    name: s.name,
    accountSlug: s.account_slug ?? null,
  }));
}

export async function fetchBandwidth(
  fetcher: HttpFetcher,
  accountSlug: string,
): Promise<NormalizedBandwidth> {
  const res = await fetcher(`${BASE_URL}/accounts/${accountSlug}/bandwidth`);
  if (!res.ok) {
    throw new Error(`fetchBandwidth(${accountSlug}) failed: HTTP ${res.status}`);
  }
  const raw = await res.json();
  const parsed = NetlifyBandwidthSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`fetchBandwidth(${accountSlug}) parse error: ${parsed.error.message}`);
  }
  return {
    usedGb: parsed.data.used,
    includedGb: parsed.data.included,
  };
}

export async function fetchBuildUsage(
  fetcher: HttpFetcher,
  accountSlug: string,
): Promise<NormalizedBuildUsage> {
  const res = await fetcher(`${BASE_URL}/accounts/${accountSlug}/builds/status`);
  if (!res.ok) {
    throw new Error(`fetchBuildUsage(${accountSlug}) failed: HTTP ${res.status}`);
  }
  const raw = await res.json();
  const parsed = NetlifyBuildUsageSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`fetchBuildUsage(${accountSlug}) parse error: ${parsed.error.message}`);
  }
  return {
    usedMinutes: parsed.data.used,
    includedMinutes: parsed.data.included,
  };
}
