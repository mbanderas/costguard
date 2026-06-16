import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";

// ------------------------------------------------------------------
// Interfaces
// ------------------------------------------------------------------

export interface CostguardDefaults {
  cronThresholdMinutes: number; // default 15
  ciMinuteRate: number; // default 0.008 (USD/min, GitHub-hosted Linux)
  assumedPushesPerDay: number; // default 10 (for inferable CI cadence)
  assumedMinutesPerRun: number; // default 5  (avg wasted minutes per redundant run)
}

export interface WorkspaceOverrides {
  cronThresholdMinutes?: number;
}

export interface CostguardConfig {
  workspacesRoot: string; // default expand("~/Workspaces")
  defaults: CostguardDefaults;
  perWorkspace: Record<string, WorkspaceOverrides>;
}

/** Resolved view a check actually consumes (defaults merged with per-ws override). */
export interface ResolvedWorkspaceConfig {
  cronThresholdMinutes: number;
  ciMinuteRate: number;
  assumedPushesPerDay: number;
  assumedMinutesPerRun: number;
}

// ------------------------------------------------------------------
// Path helpers
// ------------------------------------------------------------------

export function expandTilde(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/** ~/.costguard directory */
export function dataDir(): string {
  return path.join(os.homedir(), ".costguard");
}

/**
 * Registry lives in the project repo root (next to costguard.config.json),
 * resolved relative to process.cwd() at call time.
 */
export function registryPath(): string {
  return path.join(process.cwd(), "workspaces.json");
}

/** ~/.costguard/last-run.json */
export function lastRunPath(): string {
  return path.join(dataDir(), "last-run.json");
}

// ------------------------------------------------------------------
// Default config
// ------------------------------------------------------------------

export const DEFAULT_CONFIG: CostguardConfig = {
  workspacesRoot: path.join(os.homedir(), "Workspaces"),
  defaults: {
    cronThresholdMinutes: 15,
    ciMinuteRate: 0.008,
    assumedPushesPerDay: 10,
    assumedMinutesPerRun: 5,
  },
  perWorkspace: {},
};

// ------------------------------------------------------------------
// Zod schema for costguard.config.json
// ------------------------------------------------------------------

const WorkspaceOverridesSchema = z.object({
  cronThresholdMinutes: z.number().positive().optional(),
});

const CostguardDefaultsSchema = z.object({
  cronThresholdMinutes: z.number().positive().optional(),
  ciMinuteRate: z.number().positive().optional(),
  assumedPushesPerDay: z.number().positive().optional(),
  assumedMinutesPerRun: z.number().positive().optional(),
});

const CostguardConfigFileSchema = z.object({
  workspacesRoot: z.string().optional(),
  defaults: CostguardDefaultsSchema.optional(),
  perWorkspace: z.record(z.string(), WorkspaceOverridesSchema).optional(),
});

type CostguardConfigFile = z.infer<typeof CostguardConfigFileSchema>;

// ------------------------------------------------------------------
// Loader
// ------------------------------------------------------------------

function toWorkspaceOverride(raw: {
  cronThresholdMinutes?: number | undefined;
}): WorkspaceOverrides {
  const result: WorkspaceOverrides = {};
  if (raw.cronThresholdMinutes !== undefined) {
    result.cronThresholdMinutes = raw.cronThresholdMinutes;
  }
  return result;
}

function buildPerWorkspace(
  base: Record<string, WorkspaceOverrides>,
  overrides: Record<string, { cronThresholdMinutes?: number | undefined }> | undefined,
): Record<string, WorkspaceOverrides> {
  if (overrides === undefined) return base;
  const result: Record<string, WorkspaceOverrides> = { ...base };
  for (const [ws, ov] of Object.entries(overrides)) {
    const prev: WorkspaceOverrides = result[ws] ?? {};
    result[ws] = { ...prev, ...toWorkspaceOverride(ov) };
  }
  return result;
}

function deepMergeConfig(
  base: CostguardConfig,
  override: CostguardConfigFile,
): CostguardConfig {
  return {
    workspacesRoot: override.workspacesRoot !== undefined
      ? expandTilde(override.workspacesRoot)
      : base.workspacesRoot,
    defaults: {
      cronThresholdMinutes:
        override.defaults?.cronThresholdMinutes ?? base.defaults.cronThresholdMinutes,
      ciMinuteRate:
        override.defaults?.ciMinuteRate ?? base.defaults.ciMinuteRate,
      assumedPushesPerDay:
        override.defaults?.assumedPushesPerDay ?? base.defaults.assumedPushesPerDay,
      assumedMinutesPerRun:
        override.defaults?.assumedMinutesPerRun ?? base.defaults.assumedMinutesPerRun,
    },
    perWorkspace: buildPerWorkspace(base.perWorkspace, override.perWorkspace),
  };
}

/**
 * Reads costguard.config.json from cwd (or process.cwd() if omitted),
 * deep-merges over DEFAULT_CONFIG, and returns the result.
 * Throws a descriptive Error if the file is present but fails validation.
 * Returns DEFAULT_CONFIG if the file is absent.
 */
export function loadConfig(cwd?: string): CostguardConfig {
  const root = cwd ?? process.cwd();
  const configPath = path.join(root, "costguard.config.json");

  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const raw: unknown = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const parsed = CostguardConfigFileSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(
      `costguard.config.json is invalid:\n${parsed.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }

  return deepMergeConfig(DEFAULT_CONFIG, parsed.data);
}

/**
 * Merges CostguardDefaults with any per-workspace overrides into the
 * flat view that check modules consume.
 */
export function resolveWorkspaceConfig(
  config: CostguardConfig,
  workspace: string,
): ResolvedWorkspaceConfig {
  const overrides: WorkspaceOverrides = config.perWorkspace[workspace] ?? {};
  return {
    cronThresholdMinutes:
      overrides.cronThresholdMinutes ?? config.defaults.cronThresholdMinutes,
    ciMinuteRate: config.defaults.ciMinuteRate,
    assumedPushesPerDay: config.defaults.assumedPushesPerDay,
    assumedMinutesPerRun: config.defaults.assumedMinutesPerRun,
  };
}
