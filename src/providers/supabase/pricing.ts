/**
 * Returns the index of `tier` in Object.keys(pricing), or -1 if absent.
 */
export function computeTierRank(
  tier: string,
  pricing: Record<string, number>,
): number {
  return Object.keys(pricing).indexOf(tier);
}

/**
 * Returns the monthly USD cost for a given compute tier, or 0 if not found.
 */
export function monthlyUsdForTier(
  tier: string,
  pricing: Record<string, number>,
): number {
  return pricing[tier] ?? 0;
}

/**
 * Returns the cost delta if live tier is more expensive than declared.
 * Returns 0 if live is equal or cheaper.
 */
export function overProvisionedComputeDelta(
  declared: string,
  live: string,
  pricing: Record<string, number>,
): number {
  const declaredRank = computeTierRank(declared, pricing);
  const liveRank = computeTierRank(live, pricing);
  if (liveRank > declaredRank) {
    const delta = monthlyUsdForTier(live, pricing) - monthlyUsdForTier(declared, pricing);
    return Math.max(0, delta);
  }
  return 0;
}
