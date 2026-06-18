/**
 * Pure rule functions for cron frequency analysis.
 *
 * Rules:
 *   cron/too-frequent  — min interval < cronThresholdMinutes (default 15)
 *   cron/overlap       — two hits fire on the same minute
 *   cron/unbounded     — recurring hit with guarded===false (may pile up)
 *
 * Uses cron-parser v5 to compute next occurrences.
 * Invalid / unparseable expressions are silently skipped.
 *
 * NOTE: .github/workflows on: schedule: is NOT scanned here.
 *       GitHub Actions schedule cost is owned by the CI module (rule ci/schedule-frequency).
 */

import { CronExpressionParser, type CronExpression } from "cron-parser";
import type { Finding } from "../../types.js";
import type { CheckContext } from "../../types.js";
import type { CronHit } from "./parser.js";

const RULE_TOO_FREQUENT = "cron/too-frequent";
const RULE_OVERLAP = "cron/overlap";
const RULE_UNBOUNDED = "cron/unbounded";
const PROVIDER = "cron";

/**
 * Compute the minimum gap in minutes across the next N occurrences.
 * Returns null if the expression is unparseable or has fewer than 2 occurrences.
 */
function minIntervalMinutes(expr: string, samples = 5): number | null {
  let interval: CronExpression;
  try {
    interval = CronExpressionParser.parse(expr, { tz: "UTC" });
  } catch {
    return null;
  }

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    try {
      const next = interval.next() as { getTime(): number };
      times.push(next.getTime());
    } catch {
      break;
    }
  }

  if (times.length < 2) return null;

  let minGap = Infinity;
  for (let i = 1; i < times.length; i++) {
    const prev = times[i - 1];
    const curr = times[i];
    if (prev === undefined || curr === undefined) continue;
    const gapMs = curr - prev;
    const gapMin = gapMs / 60_000;
    if (gapMin < minGap) minGap = gapMin;
  }

  return minGap === Infinity ? null : minGap;
}

/**
 * Get the timestamp (ms) of the next occurrence for a cron expression.
 * Returns null if unparseable.
 */
function nextOccurrenceMs(expr: string): number | null {
  try {
    const interval = CronExpressionParser.parse(expr, { tz: "UTC" });
    const next = interval.next() as { getTime(): number };
    return next.getTime();
  } catch {
    return null;
  }
}

/**
 * Estimated invocations per month for a given interval in minutes.
 */
function estInvocationsPerMonth(intervalMinutes: number): number {
  const minutesPerMonth = 60 * 24 * 30;
  return Math.round(minutesPerMonth / intervalMinutes);
}

function fileRef(hit: CronHit): string {
  return `${hit.file}:${hit.line}`;
}

function ruleTooFrequent(
  hits: readonly CronHit[],
  ctx: CheckContext,
): Finding[] {
  const threshold = ctx.config.cronThresholdMinutes;
  const findings: Finding[] = [];

  for (const hit of hits) {
    const minGap = minIntervalMinutes(hit.expr);
    if (minGap === null) continue; // unparseable — skip silently
    if (minGap >= threshold) continue;

    const invocations = estInvocationsPerMonth(minGap);
    findings.push({
      workspace: ctx.workspace,
      provider: PROVIDER,
      rule: RULE_TOO_FREQUENT,
      severity: "high",
      estMonthlyUsd: 0,
      title: `Cron too frequent: \`${hit.expr}\` at ${fileRef(hit)}`,
      detail:
        `Expression fires every ~${minGap.toFixed(1)} min (threshold: ${threshold} min). ` +
        `Estimated ${invocations} invocations/month.`,
      fix: `Widen the schedule to \`*/15 * * * *\` (every 15 min) or longer.`,
      autofixable: true,
    });
  }

  return findings;
}

function ruleOverlap(hits: readonly CronHit[], ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];

  // Group by next-occurrence minute (floored to minute boundary)
  type Group = { hits: CronHit[]; nextMs: number };
  const buckets = new Map<number, Group>();

  for (const hit of hits) {
    const nextMs = nextOccurrenceMs(hit.expr);
    if (nextMs === null) continue;

    // Floor to minute boundary
    const minuteKey = Math.floor(nextMs / 60_000);

    const existing = buckets.get(minuteKey);
    if (existing === undefined) {
      buckets.set(minuteKey, { hits: [hit], nextMs });
    } else {
      existing.hits.push(hit);
    }
  }

  // Any bucket with 2+ hits is an overlap
  const reported = new Set<string>();

  for (const group of buckets.values()) {
    if (group.hits.length < 2) continue;

    // Sort for deterministic pairing
    const sorted = [...group.hits].sort((a, b) =>
      fileRef(a).localeCompare(fileRef(b)),
    );

    // Emit one finding per pair
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (a === undefined || b === undefined) continue;

        const pairKey = `${fileRef(a)}||${fileRef(b)}`;
        if (reported.has(pairKey)) continue;
        reported.add(pairKey);

        findings.push({
          workspace: ctx.workspace,
          provider: PROVIDER,
          rule: RULE_OVERLAP,
          severity: "warn",
          estMonthlyUsd: 0,
          title: `Cron overlap: \`${a.expr}\` and \`${b.expr}\` fire on the same minute`,
          detail:
            `${fileRef(a)} (\`${a.expr}\`) and ${fileRef(b)} (\`${b.expr}\`) ` +
            `both fire at the same minute — duplicate work.`,
          fix: `Stagger the schedules by at least 1 minute, or merge the handlers.`,
          autofixable: false,
        });
      }
    }
  }

  return findings;
}

function ruleUnbounded(
  hits: readonly CronHit[],
  ctx: CheckContext,
): Finding[] {
  const findings: Finding[] = [];

  for (const hit of hits) {
    // vercel crons invoke a managed serverless HTTP endpoint — the platform
    // handles concurrency isolation, so overlapping-run risk does not apply.
    if (hit.source === "vercel") continue;
    if (hit.guarded) continue;
    const minGap = minIntervalMinutes(hit.expr);
    if (minGap === null) continue; // unparseable — skip

    findings.push({
      workspace: ctx.workspace,
      provider: PROVIDER,
      rule: RULE_UNBOUNDED,
      severity: "warn",
      estMonthlyUsd: 0,
      title: `Cron unbounded: \`${hit.expr}\` at ${fileRef(hit)} has no concurrency guard`,
      detail:
        `${fileRef(hit)} fires every ~${minGap.toFixed(1)} min with no detected ` +
        `lock or singletonKey. Runs may pile up if execution exceeds the interval. ` +
        `(Guard detection checks ±5 lines for singletonKey/concurrency/exclusive/lock — ` +
        `this heuristic is intentionally approximate and false-positive-prone.)`,
      fix: `Add a singletonKey, concurrency limit, or distributed lock to prevent overlapping runs.`,
      autofixable: false,
    });
  }

  return findings;
}

/**
 * Apply all three cron rules to a set of CronHits.
 * Exported for direct unit-testing of individual rules.
 */
export function applyRules(hits: CronHit[], ctx: CheckContext): Finding[] {
  return [
    ...ruleTooFrequent(hits, ctx),
    ...ruleOverlap(hits, ctx),
    ...ruleUnbounded(hits, ctx),
  ];
}
