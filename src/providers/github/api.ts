import type { HttpFetcher } from "../types.js";
import { UsageResponseSchema, type UsageItem } from "./types.js";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function fetchFromUrl(
  fetcher: HttpFetcher,
  url: string,
): Promise<{ ok: boolean; items: UsageItem[] }> {
  const res = await fetcher(url, { headers: GITHUB_HEADERS });
  if (!res.ok) return { ok: false, items: [] };
  const raw = await res.json();
  const parsed = UsageResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `GitHub usage API response invalid at ${url}: ${parsed.error.message}`,
    );
  }
  return { ok: true, items: parsed.data.usageItems };
}

export async function fetchUsage(
  fetcher: HttpFetcher,
  owner: string,
  ownerType?: "user" | "org",
): Promise<UsageItem[]> {
  const orgUrl = `https://api.github.com/orgs/${owner}/settings/billing/usage`;
  const userUrl = `https://api.github.com/users/${owner}/settings/billing/usage`;

  if (ownerType === "org") {
    const result = await fetchFromUrl(fetcher, orgUrl);
    if (!result.ok) throw new Error(`GitHub org billing usage fetch failed for ${owner}`);
    return result.items;
  }

  if (ownerType === "user") {
    const result = await fetchFromUrl(fetcher, userUrl);
    if (!result.ok) throw new Error(`GitHub user billing usage fetch failed for ${owner}`);
    return result.items;
  }

  // Auto-detect: try org first, fall back to user
  const orgResult = await fetchFromUrl(fetcher, orgUrl);
  if (orgResult.ok) return orgResult.items;

  const userResult = await fetchFromUrl(fetcher, userUrl);
  if (userResult.ok) return userResult.items;

  throw new Error(`GitHub billing usage fetch failed for ${owner} (tried org and user endpoints)`);
}
