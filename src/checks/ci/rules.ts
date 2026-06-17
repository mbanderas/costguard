import parser from "cron-parser";
import type { Finding } from "../../types.js";
import type { CheckContext } from "../../types.js";
import type { WorkflowModel } from "./parser.js";
import {
  loadRunnerPricing,
  parseRunnerLabel,
  hostedRatePerMinute,
  baselineRatePerMinute,
  isSelfHostedRunner,
} from "./runnerPricing.js";

// ------------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------------

function base(
  model: WorkflowModel,
  rule: string,
  ctx: CheckContext,
): Omit<Finding, "severity" | "estMonthlyUsd" | "title" | "detail" | "fix" | "autofixable"> {
  return {
    workspace: ctx.workspace,
    provider: "ci",
    rule,
  };
}

function monthlyUsd(
  wastedMinutesPerRun: number,
  runsPerMonth: number,
  ciMinuteRate: number,
): number {
  return wastedMinutesPerRun * runsPerMonth * ciMinuteRate;
}

function fileRef(model: WorkflowModel, suffix?: string): string {
  const name = model.filePath.replace(/\\/g, "/").split("/").pop() ?? model.filePath;
  return suffix ? `${name}#${suffix}` : name;
}

// ------------------------------------------------------------------
// Rule 1: ci/double-trigger
// push.branches and pull_request.branches share a branch
// ------------------------------------------------------------------

export function checkDoubleTrigger(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const pushBranches = model.push?.branches ?? [];
  const prBranches = model.pull_request?.branches ?? [];

  if (pushBranches.length === 0 || prBranches.length === 0) return [];

  const shared = pushBranches.filter((b) => prBranches.includes(b));
  if (shared.length === 0) return [];

  const { ciMinuteRate, assumedPushesPerDay, assumedMinutesPerRun } = ctx.config;
  const runsPerMonth = assumedPushesPerDay * 30;
  const est = monthlyUsd(assumedMinutesPerRun, runsPerMonth, ciMinuteRate);

  return [
    {
      ...base(model, "ci/double-trigger", ctx),
      severity: "high",
      estMonthlyUsd: est,
      title: "Push + pull_request triggers on shared branch — CI runs twice per commit",
      detail:
        `${fileRef(model, "on")}: push and pull_request both target branch(es) [${shared.join(", ")}]. ` +
        `Every commit triggers two CI runs: one for the push event and one for the PR event.`,
      fix:
        "Remove the push trigger and use pull_request-only triggering. " +
        "For merge-to-main CI, use workflow_call reuse from a deploy workflow. " +
        "See templates/ci.yml for the recommended pattern.",
      autofixable: true,
    },
  ];
}

// ------------------------------------------------------------------
// Rule 2: ci/no-paths-ignore
// push/pull_request trigger lacking paths-ignore covering docs
// ------------------------------------------------------------------

const REQUIRED_PATHS_IGNORE = ["**.md", "docs/**"];

function hasSufficientPathsIgnore(patterns: string[] | undefined): boolean {
  if (patterns === undefined || patterns.length === 0) return false;
  return REQUIRED_PATHS_IGNORE.every((req) => patterns.includes(req));
}

export function checkNoPathsIgnore(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const findings: Finding[] = [];

  if (
    model.push !== undefined &&
    !hasSufficientPathsIgnore(model.push["paths-ignore"])
  ) {
    findings.push({
      ...base(model, "ci/no-paths-ignore", ctx),
      severity: "warn",
      estMonthlyUsd: 0,
      title: "Push trigger missing paths-ignore for docs/markdown",
      detail:
        `${fileRef(model, "on.push")}: push trigger has no paths-ignore covering ` +
        `['**.md', 'docs/**']. Doc-only commits trigger a full CI run unnecessarily. ` +
        `Doc-commit fraction is unknown so cost is not estimated.`,
      fix:
        "Add paths-ignore: ['**.md', 'docs/**'] to the push trigger to skip " +
        "CI on documentation-only changes.",
      autofixable: true,
    });
  }

  if (
    model.pull_request !== undefined &&
    !hasSufficientPathsIgnore(model.pull_request["paths-ignore"])
  ) {
    findings.push({
      ...base(model, "ci/no-paths-ignore", ctx),
      severity: "warn",
      estMonthlyUsd: 0,
      title: "pull_request trigger missing paths-ignore for docs/markdown",
      detail:
        `${fileRef(model, "on.pull_request")}: pull_request trigger has no paths-ignore covering ` +
        `['**.md', 'docs/**']. Doc-only PRs trigger a full CI run unnecessarily. ` +
        `Doc-commit fraction is unknown so cost is not estimated.`,
      fix:
        "Add paths-ignore: ['**.md', 'docs/**'] to the pull_request trigger.",
      autofixable: true,
    });
  }

  return findings;
}

// ------------------------------------------------------------------
// Rule 3: ci/no-concurrency
// No top-level concurrency with cancel-in-progress:true
// ------------------------------------------------------------------

export function checkNoConcurrency(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const conc = model.concurrency;
  if (conc !== undefined && conc["cancel-in-progress"] === true) return [];

  return [
    {
      ...base(model, "ci/no-concurrency", ctx),
      severity: "warn",
      estMonthlyUsd: 0,
      title: "No concurrency group with cancel-in-progress — superseded runs waste minutes",
      detail:
        `${fileRef(model)}: workflow has no top-level concurrency block with cancel-in-progress: true. ` +
        `When commits are pushed rapidly, older runs are not cancelled, wasting runner minutes. ` +
        `Superseded-run count is unknown so cost is not estimated.`,
      fix:
        "Add a top-level concurrency block: " +
        "concurrency: { group: 'ci-${{ github.workflow }}-${{ github.ref }}', cancel-in-progress: true }",
      autofixable: true,
    },
  ];
}

// ------------------------------------------------------------------
// Rule 4: ci/no-timeout
// A job with no timeout-minutes
// ------------------------------------------------------------------

export function checkNoTimeout(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const findings: Finding[] = [];

  for (const [jobName, job] of Object.entries(model.jobs)) {
    if (job.timeoutMinutes === undefined) {
      findings.push({
        ...base(model, "ci/no-timeout", ctx),
        severity: "warn",
        estMonthlyUsd: 0,
        title: `Job '${jobName}' has no timeout-minutes`,
        detail:
          `${fileRef(model, jobName)}: job '${jobName}' has no timeout-minutes set. ` +
          `Hung jobs burn up to the GitHub default 6-hour cap (360 minutes per run). ` +
          `Actual waste depends on hang frequency.`,
        fix: `Add timeout-minutes: 15 (or an appropriate value) to job '${jobName}'.`,
        autofixable: true,
      });
    }
  }

  return findings;
}

// ------------------------------------------------------------------
// Rule 5: ci/job-fanout
// >=3 jobs with identical runs-on AND >50% overlap in step refs
// ------------------------------------------------------------------

function stepRefs(job: { steps: { uses?: string; run?: string }[] }): string[] {
  return job.steps
    .map((s) => s.uses ?? s.run ?? "")
    .filter((s) => s.length > 0);
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const shared = b.filter((x) => setA.has(x)).length;
  return shared / Math.max(a.length, b.length);
}

export function checkJobFanout(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const entries = Object.entries(model.jobs);
  if (entries.length < 3) return [];

  // Group by runs-on
  const byRunner = new Map<string, Array<[string, typeof entries[0][1]]>>();
  for (const [name, job] of entries) {
    const group = byRunner.get(job.runsOn) ?? [];
    group.push([name, job]);
    byRunner.set(job.runsOn, group);
  }

  const findings: Finding[] = [];

  for (const [runner, jobs] of byRunner) {
    if (jobs.length < 3) continue;

    // Check if >50% of step refs overlap between all pairs
    const refs = jobs.map(([, j]) => stepRefs(j));
    const firstRef = refs[0] ?? [];

    // Count how many jobs have >50% overlap with the first job
    const overlapping = jobs.filter((_, i) => {
      const r = refs[i] ?? [];
      return overlapRatio(firstRef, r) > 0.5;
    });

    if (overlapping.length < 3) continue;

    const jobNames = overlapping.map(([name]) => name).join(", ");
    const { ciMinuteRate, assumedPushesPerDay, assumedMinutesPerRun } = ctx.config;
    const runsPerMonth = assumedPushesPerDay * 30;
    const est = monthlyUsd(
      (overlapping.length - 1) * assumedMinutesPerRun,
      runsPerMonth,
      ciMinuteRate,
    );

    findings.push({
      ...base(model, "ci/job-fanout", ctx),
      severity: "warn",
      estMonthlyUsd: est,
      title: `${overlapping.length} near-identical jobs on '${runner}' — collapsible`,
      detail:
        `${fileRef(model)}: jobs [${jobNames}] all run on '${runner}' with >50% ` +
        `overlapping steps (checkout + install repeated per job). Each redundant job ` +
        `re-pays the checkout+install overhead (~${assumedMinutesPerRun} min each).`,
      fix:
        "Collapse into one job with sequential steps. " +
        "See templates/ci.yml 'checks' job for the consolidated pattern.",
      autofixable: true,
    });
  }

  return findings;
}

// ------------------------------------------------------------------
// Rule 6: ci/matrix-overkill
// strategy.matrix with total combination count > 2
// ------------------------------------------------------------------

function matrixCombinationCount(matrix: Record<string, unknown>): number {
  let count = 1;
  for (const [key, val] of Object.entries(matrix)) {
    if (key === "include" || key === "exclude") continue;
    if (Array.isArray(val)) {
      count *= val.length;
    }
  }
  return count;
}

export function checkMatrixOverkill(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const findings: Finding[] = [];

  for (const [jobName, job] of Object.entries(model.jobs)) {
    if (job.matrix === undefined) continue;

    const count = matrixCombinationCount(job.matrix);
    if (count <= 2) continue;

    const dims = Object.entries(job.matrix)
      .filter(([k]) => k !== "include" && k !== "exclude")
      .map(([k, v]) => `${k}[${Array.isArray(v) ? (v as unknown[]).length : 1}]`)
      .join(" x ");

    findings.push({
      ...base(model, "ci/matrix-overkill", ctx),
      severity: "warn",
      estMonthlyUsd: 0,
      title: `Job '${jobName}' has ${count}-combination matrix`,
      detail:
        `${fileRef(model, jobName)}: job '${jobName}' strategy.matrix expands to ` +
        `${count} combinations (${dims}). Consider whether all combinations are ` +
        `required for every PR. Cost depends on combination count and run frequency.`,
      fix:
        "Prune the matrix to the minimum required dimensions. " +
        "Consider running the full matrix only on push to main.",
      autofixable: true,
    });
  }

  return findings;
}

// ------------------------------------------------------------------
// Rule 7: ci/schedule-frequency
// on.schedule.cron firing more than once per day
// ------------------------------------------------------------------

function computeCronRunsPerDay(cronExpr: string): number {
  try {
    // Count occurrences in a 24-hour window using a day offset from
    // one minute before midnight so the 00:00 slot is included via next().
    const startBefore = new Date("2023-12-31T23:59:00Z");
    const end = new Date("2024-01-02T00:00:00Z");

    const it = parser.parseExpression(cronExpr, {
      currentDate: startBefore,
      endDate: end,
      iterator: false,
    });

    let count = 0;
    try {
      while (true) {
        const next = it.next();
        const t = next.getTime();
        if (t >= end.getTime()) break;
        count++;
        if (count > 1500) break; // safety cap
      }
    } catch {
      // StopIteration or similar — done
    }

    return count;
  } catch {
    return 0;
  }
}

function minIntervalMinutes(cronExpr: string): number {
  try {
    const start = new Date("2023-12-31T23:59:00Z");
    const it = parser.parseExpression(cronExpr, {
      currentDate: start,
      iterator: false,
    });

    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        times.push(it.next().getTime());
      } catch {
        break;
      }
    }

    if (times.length < 2) return Infinity;

    let minGap = Infinity;
    for (let i = 1; i < times.length; i++) {
      const prev = times[i - 1];
      const curr = times[i];
      if (prev !== undefined && curr !== undefined) {
        const gap = (curr - prev) / 60000;
        if (gap < minGap) minGap = gap;
      }
    }
    return minGap;
  } catch {
    return Infinity;
  }
}

export function checkScheduleFrequency(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  if (model.schedule === undefined || model.schedule.length === 0) return [];

  const findings: Finding[] = [];
  const { ciMinuteRate, assumedMinutesPerRun, cronThresholdMinutes } = ctx.config;

  for (const entry of model.schedule) {
    const runsPerDay = computeCronRunsPerDay(entry.cron);
    if (runsPerDay <= 1) continue;

    const minInterval = minIntervalMinutes(entry.cron);
    const isHigh = minInterval < cronThresholdMinutes;
    const runsPerMonth = runsPerDay * 30;
    const est = monthlyUsd(assumedMinutesPerRun, runsPerMonth, ciMinuteRate);

    findings.push({
      ...base(model, "ci/schedule-frequency", ctx),
      severity: isHigh ? "high" : "warn",
      estMonthlyUsd: est,
      title: `Schedule cron '${entry.cron}' fires ~${runsPerDay}x/day`,
      detail:
        `${fileRef(model, "on.schedule")}: cron '${entry.cron}' fires approximately ` +
        `${runsPerDay} times per day (~${runsPerMonth} runs/month). ` +
        `Min interval: ${minInterval === Infinity ? "unknown" : `${minInterval} min`}. ` +
        `Threshold: ${cronThresholdMinutes} min.`,
      fix:
        "Widen the schedule (e.g. daily instead of every 5 minutes) or gate the " +
        "workflow on actual file changes using paths filters.",
      autofixable: true,
    });
  }

  return findings;
}

// ------------------------------------------------------------------
// Rule 8: ci/oversized-runner
// A job on a GitHub larger runner (e.g. ubuntu-latest-32-cores) priced
// well above a right-sized standard runner. Quantifies the per-minute
// premium x assumed run cadence into a real $/mo, from the sourced
// knowledge/github-actions.json rate table.
// ------------------------------------------------------------------

export function checkOversizedRunner(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const findings: Finding[] = [];
  const { assumedMinutesPerRun, assumedPushesPerDay } = ctx.config;
  const runsPerMonth = assumedPushesPerDay * 30;
  const baselineCores = loadRunnerPricing().baselineCores;

  for (const [jobName, job] of Object.entries(model.jobs)) {
    const parsed = parseRunnerLabel(job.runsOn);
    if (parsed === null) continue;

    const rate = hostedRatePerMinute(parsed.os, parsed.cores);
    const baseline = baselineRatePerMinute(parsed.os);
    // Unknown size for this os, or not actually larger than the baseline.
    if (rate === undefined || baseline === undefined || rate <= baseline) continue;

    const premiumPerMin = rate - baseline;
    const baseCores = baselineCores[parsed.os];
    const est = monthlyUsd(assumedMinutesPerRun, runsPerMonth, premiumPerMin);

    findings.push({
      ...base(model, "ci/oversized-runner", ctx),
      severity: "warn",
      estMonthlyUsd: est,
      title: `Job '${jobName}' runs on a ${parsed.cores}-core ${parsed.os} larger runner`,
      detail:
        `${fileRef(model, jobName)}: runs-on '${job.runsOn}' bills $${rate}/min versus ` +
        `$${baseline}/min for a right-sized ${baseCores}-core ${parsed.os} runner — a ` +
        `$${premiumPerMin.toFixed(3)}/min premium. Larger runners only pay off for CPU-bound ` +
        `work; an I/O- or wait-bound job wastes the premium. Estimate assumes ` +
        `~${assumedMinutesPerRun} min/run x ${runsPerMonth} runs/mo.`,
      fix:
        `Drop to a standard ${parsed.os} runner unless the job is genuinely CPU-bound. ` +
        `Compare wall-clock time on a standard runner first; keep the larger runner only ` +
        `if it meaningfully shortens the job.`,
      autofixable: false,
    });
  }

  return findings;
}

// ------------------------------------------------------------------
// Rule 9: ci/self-hosted-fee
// A job on a self-hosted runner now incurs GitHub's Actions cloud platform
// fee (effective 2026-03-01). Self-hosted minutes were previously free; this
// turns the new per-minute charge into a real $/mo from the sourced
// knowledge/github-actions.json fact file.
// ------------------------------------------------------------------

export function checkSelfHostedFee(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const pricing = loadRunnerPricing();
  const fee = pricing.selfHostedPlatformFeePerMinute;
  if (fee <= 0) return [];

  const { assumedMinutesPerRun, assumedPushesPerDay } = ctx.config;
  const runsPerMonth = assumedPushesPerDay * 30;
  const findings: Finding[] = [];

  for (const [jobName, job] of Object.entries(model.jobs)) {
    if (!isSelfHostedRunner(job.runsOn)) continue;

    const est = monthlyUsd(assumedMinutesPerRun, runsPerMonth, fee);
    findings.push({
      ...base(model, "ci/self-hosted-fee", ctx),
      severity: "warn",
      estMonthlyUsd: est,
      title: `Job '${jobName}' runs on a self-hosted runner — now billed $${fee}/min platform fee`,
      detail:
        `${fileRef(model, jobName)}: runs-on '${job.runsOn}' targets a self-hosted runner. ` +
        `Effective ${pricing.selfHostedFeeEffective}, GitHub bills a $${fee}/min Actions cloud ` +
        `platform fee on self-hosted minutes that were previously free. Estimate assumes ` +
        `~${assumedMinutesPerRun} min/run x ${runsPerMonth} runs/mo.`,
      fix:
        "Self-hosted minutes are no longer free. Cut self-hosted run volume " +
        "(cancel-in-progress concurrency, path/branch filters) or move light jobs to " +
        "GitHub-hosted runners and compare total cost. Confirm the fee against your plan first.",
      autofixable: false,
    });
  }

  return findings;
}

// ------------------------------------------------------------------
// Rule 10: ci/docker-build-no-cache
// A `run: docker build` step with no layer cache rebuilds every layer on
// each run. Build-minute savings depend on image size/layer churn and are
// not inferable from YAML, so this is a structural (estMonthlyUsd:0) finding
// in the hybrid model — like ci/no-concurrency.
// ------------------------------------------------------------------

const DOCKER_BUILD_RE = /\bdocker\s+(?:buildx\s+)?build\b/;
// Any of these signals an active layer cache (registry/gha/local buildx cache
// or a BuildKit cache mount).
const DOCKER_CACHE_RE = /--cache-from|--cache-to|--mount=type=cache/;

export function checkDockerBuildNoCache(
  model: WorkflowModel,
  ctx: CheckContext,
): Finding[] {
  const findings: Finding[] = [];

  for (const [jobName, job] of Object.entries(model.jobs)) {
    for (const step of job.steps) {
      const run = step.run;
      if (run === undefined) continue;
      if (!DOCKER_BUILD_RE.test(run) || DOCKER_CACHE_RE.test(run)) continue;

      const stepRef = step.name ?? "docker build";
      findings.push({
        ...base(model, "ci/docker-build-no-cache", ctx),
        severity: "warn",
        estMonthlyUsd: 0,
        title: `Job '${jobName}' builds a Docker image without a layer cache`,
        detail:
          `${fileRef(model, jobName)}: step '${stepRef}' runs \`docker build\` with no ` +
          `--cache-from/--cache-to or BuildKit cache mount. Every run rebuilds all layers from ` +
          `scratch instead of reusing unchanged ones. Saved minutes depend on image size and ` +
          `layer churn, so cost is not estimated.`,
        fix:
          "Use docker/setup-buildx-action and build with a persistent cache, e.g. " +
          "`docker buildx build --cache-from type=gha --cache-to type=gha,mode=max ...`, " +
          "or the docker/build-push-action cache-from/cache-to inputs.",
        autofixable: false,
      });
    }
  }

  return findings;
}
