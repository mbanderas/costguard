import type { HttpFetcher } from "../types.js";
import { RenderServicesSchema } from "./types.js";

const BASE_URL = "https://api.render.com/v1";

/**
 * Fetch the live compute plan of each service, keyed by service name. Services
 * without a resolvable plan (e.g. static sites) are omitted.
 */
export async function fetchServicePlans(
  fetcher: HttpFetcher,
): Promise<Map<string, string>> {
  const res = await fetcher(`${BASE_URL}/services?limit=100`);
  if (!res.ok) {
    throw new Error(`fetchServicePlans failed: HTTP ${res.status}`);
  }
  const parsed = RenderServicesSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`fetchServicePlans parse error: ${parsed.error.message}`);
  }

  const plans = new Map<string, string>();
  for (const item of parsed.data) {
    const plan = item.service.serviceDetails?.plan;
    if (plan !== undefined) plans.set(item.service.name, plan);
  }
  return plans;
}
