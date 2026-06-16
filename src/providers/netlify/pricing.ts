export function buildMinuteOverageCost(
  usedMinutes: number,
  freeMinutes: number,
  ratePerMinute: number,
): number {
  return Math.max(0, usedMinutes - freeMinutes) * ratePerMinute;
}

export function bandwidthOverageCost(
  usedGb: number,
  freeGb: number,
  ratePerGb: number,
): number {
  return Math.max(0, usedGb - freeGb) * ratePerGb;
}
