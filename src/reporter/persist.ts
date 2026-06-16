import fs from "node:fs";
import type { Finding } from "../types.js";
import { dataDir, lastRunPath } from "../config.js";

export interface PersistedRun {
  generatedAt: string;
  findings: Finding[];
}

// ---------------------------------------------------------------------------
// Shape validation helpers (no zod — narrow unknown manually)
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number";
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateFinding(raw: unknown, index: number): Finding {
  if (!isRecord(raw)) {
    throw new Error(`Invalid last-run.json: findings[${index}] is not an object`);
  }

  const { workspace, provider, rule, severity, estMonthlyUsd, title, detail, fix, autofixable } =
    raw;

  if (!isString(workspace)) {
    throw new Error(`Invalid last-run.json: findings[${index}].workspace must be a string`);
  }
  if (!isString(provider)) {
    throw new Error(`Invalid last-run.json: findings[${index}].provider must be a string`);
  }
  if (!isString(rule)) {
    throw new Error(`Invalid last-run.json: findings[${index}].rule must be a string`);
  }
  if (severity !== "info" && severity !== "warn" && severity !== "high") {
    throw new Error(
      `Invalid last-run.json: findings[${index}].severity must be "info"|"warn"|"high"`,
    );
  }
  if (!isNumber(estMonthlyUsd)) {
    throw new Error(
      `Invalid last-run.json: findings[${index}].estMonthlyUsd must be a number`,
    );
  }
  if (!isString(title)) {
    throw new Error(`Invalid last-run.json: findings[${index}].title must be a string`);
  }
  if (!isString(detail)) {
    throw new Error(`Invalid last-run.json: findings[${index}].detail must be a string`);
  }
  if (!isString(fix)) {
    throw new Error(`Invalid last-run.json: findings[${index}].fix must be a string`);
  }
  if (!isBoolean(autofixable)) {
    throw new Error(
      `Invalid last-run.json: findings[${index}].autofixable must be a boolean`,
    );
  }

  return { workspace, provider, rule, severity, estMonthlyUsd, title, detail, fix, autofixable };
}

function validatePersistedRun(raw: unknown): PersistedRun {
  if (!isRecord(raw)) {
    throw new Error("Invalid last-run.json: root must be an object");
  }

  const { generatedAt, findings } = raw;

  if (!isString(generatedAt)) {
    throw new Error("Invalid last-run.json: generatedAt must be a string");
  }
  if (!Array.isArray(findings)) {
    throw new Error("Invalid last-run.json: findings must be an array");
  }

  const validatedFindings: Finding[] = findings.map((item, i) =>
    validateFinding(item, i),
  );

  return { generatedAt, findings: validatedFindings };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a run to ~/.costguard/last-run.json.
 * Creates the data directory if absent.
 * Returns the persisted run object.
 */
export function saveRun(findings: Finding[]): PersistedRun {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });

  const run: PersistedRun = {
    generatedAt: new Date().toISOString(),
    findings,
  };

  fs.writeFileSync(lastRunPath(), JSON.stringify(run, null, 2), "utf8");
  return run;
}

/**
 * Load the last run from ~/.costguard/last-run.json.
 * Returns null if the file does not exist.
 * Throws a descriptive Error if the file is present but malformed or invalid.
 */
export function loadLastRun(): PersistedRun | null {
  const filePath = lastRunPath();

  if (!fs.existsSync(filePath)) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse last-run.json: ${msg}`);
  }

  return validatePersistedRun(raw);
}

// ---------------------------------------------------------------------------
// Path helper re-export (convenience for CLI layer)
// ---------------------------------------------------------------------------

export { lastRunPath, dataDir };
