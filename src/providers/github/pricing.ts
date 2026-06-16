/**
 * Estimates overage cost in USD for GitHub Actions minutes.
 * Returns 0 if minutesUsed <= includedMinutes.
 */
export function estimateOverageUsd(
  minutesUsed: number,
  includedMinutes: number,
  ratePerMin: number,
): number {
  return Math.max(0, minutesUsed - includedMinutes) * ratePerMin;
}
