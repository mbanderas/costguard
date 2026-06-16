import type { ResolvedWorkspaceConfig } from "./config.js";

export type Severity = "info" | "warn" | "high";

export interface Finding {
  workspace: string;
  provider: string; // "ci" | "cron" | future provider ids
  rule: string; // stable id, e.g. "ci/double-trigger"
  severity: Severity;
  /**
   * HYBRID model. When a run cadence is inferable (push/PR/schedule triggers),
   * estMonthlyUsd = wastedMinutesPerRun * runsPerMonth * ciMinuteRate.
   * When not inferable, set 0 and put the raw wasted-minute estimate in `detail`.
   */
  estMonthlyUsd: number; // best-effort; 0 when unknowable but wasteful
  title: string;
  detail: string; // what was found + where (file:line or resource id)
  fix: string; // the exact change to make
  autofixable: boolean;
}

export interface CheckContext {
  workspace: string;
  workspaceDir: string;
  config: ResolvedWorkspaceConfig;
}

export type Check = (ctx: CheckContext) => Promise<Finding[]>;
