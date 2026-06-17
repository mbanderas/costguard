import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

// ------------------------------------------------------------------
// WorkflowModel types
// ------------------------------------------------------------------

export interface PushTrigger {
  branches?: string[];
  "paths-ignore"?: string[];
}

export interface PullRequestTrigger {
  branches?: string[];
  "paths-ignore"?: string[];
}

export interface ScheduleEntry {
  cron: string;
}

export interface ConcurrencyConfig {
  group: string;
  "cancel-in-progress": boolean;
}

export interface MatrixConfig {
  include?: unknown[];
  exclude?: unknown[];
  [key: string]: unknown;
}

export interface JobStep {
  uses?: string;
  run?: string;
  name?: string;
}

export interface JobModel {
  runsOn: string;
  timeoutMinutes?: number;
  steps: JobStep[];
  matrix?: MatrixConfig;
}

export interface WorkflowModel {
  filePath: string;
  push?: PushTrigger;
  pull_request?: PullRequestTrigger;
  schedule?: ScheduleEntry[];
  workflow_call: boolean;
  workflow_dispatch: boolean;
  concurrency?: ConcurrencyConfig;
  jobs: Record<string, JobModel>;
}

// ------------------------------------------------------------------
// Narrowing helpers
// ------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function toStringArray(v: unknown): string[] | undefined {
  if (isStringArray(v)) return v;
  return undefined;
}

function parsePushTrigger(raw: unknown): PushTrigger | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (!isRecord(raw)) return {};
  const result: PushTrigger = {};
  const branches = toStringArray(raw["branches"]);
  if (branches !== undefined) result.branches = branches;
  const pathsIgnore = toStringArray(raw["paths-ignore"]);
  if (pathsIgnore !== undefined) result["paths-ignore"] = pathsIgnore;
  return result;
}

function parsePullRequestTrigger(raw: unknown): PullRequestTrigger | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (!isRecord(raw)) return {};
  const result: PullRequestTrigger = {};
  const branches = toStringArray(raw["branches"]);
  if (branches !== undefined) result.branches = branches;
  const pathsIgnore = toStringArray(raw["paths-ignore"]);
  if (pathsIgnore !== undefined) result["paths-ignore"] = pathsIgnore;
  return result;
}

function parseSchedule(raw: unknown): ScheduleEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const entries: ScheduleEntry[] = [];
  for (const item of raw) {
    if (isRecord(item) && typeof item["cron"] === "string") {
      entries.push({ cron: item["cron"] });
    }
  }
  return entries.length > 0 ? entries : undefined;
}

function parseConcurrency(raw: unknown): ConcurrencyConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const group = typeof raw["group"] === "string" ? raw["group"] : "";
  const cancelInProgress =
    typeof raw["cancel-in-progress"] === "boolean"
      ? raw["cancel-in-progress"]
      : false;
  return { group, "cancel-in-progress": cancelInProgress };
}

function parseMatrix(raw: unknown): MatrixConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const result: MatrixConfig = {};
  for (const [k, v] of Object.entries(raw)) {
    result[k] = v;
  }
  return result;
}

function parseSteps(raw: unknown): JobStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: JobStep[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const step: JobStep = {};
    if (typeof item["uses"] === "string") step.uses = item["uses"];
    if (typeof item["run"] === "string") step.run = item["run"];
    if (typeof item["name"] === "string") step.name = item["name"];
    steps.push(step);
  }
  return steps;
}

function parseJob(raw: unknown): JobModel | undefined {
  if (!isRecord(raw)) return undefined;
  const runsOnRaw = raw["runs-on"];
  let runsOn = "unknown";
  if (typeof runsOnRaw === "string") {
    runsOn = runsOnRaw;
  } else if (isStringArray(runsOnRaw)) {
    // Array form, e.g. [self-hosted, linux, x64] — join the labels so
    // self-hosted/larger-runner detection sees them instead of "unknown".
    runsOn = runsOnRaw.join(", ");
  }
  const steps = parseSteps(raw["steps"]);
  const strategyRaw = raw["strategy"];
  let matrix: MatrixConfig | undefined;
  if (isRecord(strategyRaw) && isRecord(strategyRaw["matrix"])) {
    matrix = parseMatrix(strategyRaw["matrix"]);
  }
  const result: JobModel = { runsOn, steps };
  if (typeof raw["timeout-minutes"] === "number") {
    result.timeoutMinutes = raw["timeout-minutes"];
  }
  if (matrix !== undefined) {
    result.matrix = matrix;
  }
  return result;
}

function parseJobs(raw: unknown): Record<string, JobModel> {
  if (!isRecord(raw)) return {};
  const jobs: Record<string, JobModel> = {};
  for (const [name, jobRaw] of Object.entries(raw)) {
    const parsed = parseJob(jobRaw);
    if (parsed !== undefined) {
      jobs[name] = parsed;
    }
  }
  return jobs;
}

// ------------------------------------------------------------------
// Main parse function
// ------------------------------------------------------------------

export function parseWorkflow(absPath: string): WorkflowModel {
  const content = fs.readFileSync(absPath, "utf8");
  const raw: unknown = yaml.load(content);

  const filePath = path.resolve(absPath);

  if (!isRecord(raw)) {
    return {
      filePath,
      workflow_call: false,
      workflow_dispatch: false,
      jobs: {},
    };
  }

  const onRaw = raw["on"];

  let pushTrigger: PushTrigger | undefined;
  let pullRequestTrigger: PullRequestTrigger | undefined;
  let scheduleEntries: ScheduleEntry[] | undefined;
  let hasWorkflowCall = false;
  let hasWorkflowDispatch = false;

  if (isRecord(onRaw)) {
    pushTrigger = parsePushTrigger(onRaw["push"]);
    pullRequestTrigger = parsePullRequestTrigger(onRaw["pull_request"]);
    scheduleEntries = parseSchedule(onRaw["schedule"]);
    hasWorkflowCall = "workflow_call" in onRaw;
    hasWorkflowDispatch = "workflow_dispatch" in onRaw;
  } else if (Array.isArray(onRaw)) {
    // e.g. on: [push, pull_request]
    for (const item of onRaw) {
      if (item === "push") pushTrigger = {};
      if (item === "pull_request") pullRequestTrigger = {};
      if (item === "workflow_call") hasWorkflowCall = true;
      if (item === "workflow_dispatch") hasWorkflowDispatch = true;
    }
  } else if (typeof onRaw === "string") {
    if (onRaw === "push") pushTrigger = {};
    if (onRaw === "pull_request") pullRequestTrigger = {};
    if (onRaw === "workflow_call") hasWorkflowCall = true;
    if (onRaw === "workflow_dispatch") hasWorkflowDispatch = true;
  }

  const model: WorkflowModel = {
    filePath,
    workflow_call: hasWorkflowCall,
    workflow_dispatch: hasWorkflowDispatch,
    jobs: parseJobs(raw["jobs"]),
  };
  if (pushTrigger !== undefined) model.push = pushTrigger;
  if (pullRequestTrigger !== undefined) model.pull_request = pullRequestTrigger;
  if (scheduleEntries !== undefined) model.schedule = scheduleEntries;
  const concurrency = parseConcurrency(raw["concurrency"]);
  if (concurrency !== undefined) model.concurrency = concurrency;
  return model;
}
