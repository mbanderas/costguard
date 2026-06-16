/**
 * Computes the monthly overage cost for Neon compute hours.
 * Returns 0 when usedHours is within the free tier.
 */
export function computeOverageCost(
  usedHours: number,
  freeHours: number,
  ratePerHour: number,
): number {
  const overage = usedHours - freeHours;
  return overage > 0 ? overage * ratePerHour : 0;
}
