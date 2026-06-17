import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../../knowledge/paths.js";

// ------------------------------------------------------------------
// Sourced GitHub Actions runner pricing, loaded from the versioned
// knowledge fact file (knowledge/github-actions.json). Rules read rates
// from here instead of hardcoding, so prices can be updated without code
// changes. Every fact group ships a source URL in the JSON.
// ------------------------------------------------------------------

const RateTableSchema = z.record(z.string(), z.record(z.string(), z.number().nonnegative()));

const RunnerPricingSchema = z.object({
  provider: z.literal("github-actions"),
  updated: z.string(),
  hostedPerMinute: RateTableSchema,
  baselineCores: z.record(z.string(), z.number().positive()),
  selfHostedPlatformFeePerMinute: z.number().nonnegative(),
  selfHostedFeeEffective: z.string(),
  includedMinutesPerMonth: z.record(z.string(), z.number().nonnegative()),
  sources: z.array(z.object({ what: z.string(), url: z.string().url() })).min(1),
});

export type RunnerPricing = z.infer<typeof RunnerPricingSchema>;

const FACT_PATH = knowledgePath("github-actions.json");

let cached: RunnerPricing | undefined;

/** Load + validate the GitHub Actions pricing facts (cached). */
export function loadRunnerPricing(): RunnerPricing {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = RunnerPricingSchema.parse(raw);
  return cached;
}

export type RunnerOs = "linux" | "linux-arm" | "windows" | "windows-arm" | "macos";

export interface ParsedRunner {
  os: RunnerOs;
  cores: number;
}

/**
 * Parse a GitHub larger-runner label into its os family + vCPU core count.
 * Returns null for standard runners (no `-N-core(s)` suffix), self-hosted, or
 * unrecognized labels.
 */
export function parseRunnerLabel(label: string): ParsedRunner | null {
  const lower = label.toLowerCase().trim();
  const coreMatch = /(\d+)-cores?\b/.exec(lower);
  if (coreMatch === null) return null;
  const cores = Number(coreMatch[1]);
  if (!Number.isFinite(cores) || cores <= 0) return null;

  const isArm = /\barm\d*\b/.test(lower) || lower.includes("-arm-") || lower.includes("arm64");

  let os: RunnerOs;
  if (lower.includes("windows") || lower.startsWith("win")) {
    os = isArm ? "windows-arm" : "windows";
  } else if (lower.includes("macos") || lower.includes("mac")) {
    os = "macos";
  } else if (lower.includes("ubuntu") || lower.includes("linux")) {
    os = isArm ? "linux-arm" : "linux";
  } else {
    return null;
  }

  return { os, cores };
}

/** Per-minute USD rate for a hosted os + core count, or undefined if unknown. */
export function hostedRatePerMinute(os: RunnerOs, cores: number): number | undefined {
  const table = loadRunnerPricing().hostedPerMinute[os];
  if (table === undefined) return undefined;
  return table[String(cores)];
}

/**
 * True if a runs-on label set targets a self-hosted runner. Accepts the
 * parser's joined form (`"self-hosted, linux, x64"`) or a bare `"self-hosted"`.
 */
export function isSelfHostedRunner(runsOn: string): boolean {
  return runsOn
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .includes("self-hosted");
}

/** Per-minute USD rate of the right-sized baseline runner for an os family. */
export function baselineRatePerMinute(os: RunnerOs): number | undefined {
  const pricing = loadRunnerPricing();
  const baseCores = pricing.baselineCores[os];
  if (baseCores === undefined) return undefined;
  return pricing.hostedPerMinute[os]?.[String(baseCores)];
}
