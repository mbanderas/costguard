/**
 * Pure pricing helpers for Railway provider.
 * No I/O, no side effects.
 */

/**
 * Estimated monthly cost for a single idle service.
 * Splits the base monthly plan cost evenly across all services.
 * If serviceCount is 0, returns baseMonthly (no division by zero).
 */
export function idleServiceMonthlyCost(
  baseMonthly: number,
  serviceCount: number,
): number {
  return serviceCount > 0 ? baseMonthly / serviceCount : baseMonthly;
}
