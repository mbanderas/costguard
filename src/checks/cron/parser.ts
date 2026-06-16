/**
 * Cron source parser for costguard.
 *
 * Scans four cron sources:
 *   1. Inngest  — *.ts / *.js  cron("<expr>") calls and { cron: "<expr>" } object literals
 *   2. vercel   — vercel.json crons[].schedule
 *   3. pg_cron  — supabase/migrations/**\/*.sql (and any *.sql) cron.schedule('name','<expr>',...)
 *   4. node-cron — cron.schedule("<expr>") / schedule("<expr>") where node-cron is imported
 *
 * NOTE: .github/workflows on: schedule: is intentionally NOT scanned here.
 *       GitHub Actions schedule cost is owned by the CI module (rule ci/schedule-frequency).
 *
 * `guarded` heuristic: a lock/singleton identifier (singletonKey, concurrency,
 * exclusive, lock) appears within 5 lines of the match. This is intentionally
 * approximate and false-positive-prone — do not rely on it for correctness.
 */

import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

export interface CronHit {
  expr: string;
  file: string;
  line: number; // 1-based
  source: "inngest" | "vercel" | "pg_cron" | "node-cron";
  guarded: boolean;
}

// Guard keywords checked within ±5 lines of a hit
const GUARD_PATTERN = /singletonKey|concurrency|exclusive|lock/i;

/**
 * Returns true if any of the surrounding lines (±5) contain a guard keyword.
 */
function isGuarded(lines: readonly string[], matchLine: number): boolean {
  const start = Math.max(0, matchLine - 6); // 0-based, 5 lines before
  const end = Math.min(lines.length - 1, matchLine + 4); // 5 lines after
  for (let i = start; i <= end; i++) {
    if (GUARD_PATTERN.test(lines[i] ?? "")) return true;
  }
  return false;
}

/**
 * Walks a directory recursively, yielding absolute file paths.
 * Skips node_modules/ and dist/.
 */
async function* walkFiles(dir: string): AsyncGenerator<string> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true }) as unknown as Dirent[];
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = entry.name as string;
    const full = path.join(dir, name);
    if (entry.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

// Matches cron("<expr>") or cron('<expr>') function calls (Inngest style)
const INNGEST_CALL_RE = /\bcron\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
// Matches { cron: "<expr>" } or { cron: '<expr>' } object literal (Inngest trigger)
const INNGEST_OBJ_RE = /\bcron\s*:\s*(['"])([^'"]+)\1/g;

async function parseInngestFile(filePath: string): Promise<CronHit[]> {
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split("\n");
  const hits: CronHit[] = [];

  const addHit = (expr: string, matchIndex: number): void => {
    const linesBefore = text.slice(0, matchIndex).split("\n");
    const lineNum = linesBefore.length; // 1-based
    hits.push({
      expr,
      file: filePath,
      line: lineNum,
      source: "inngest",
      guarded: isGuarded(lines, lineNum - 1),
    });
  };

  for (const match of text.matchAll(INNGEST_CALL_RE)) {
    const expr = match[2];
    if (expr !== undefined) addHit(expr, match.index ?? 0);
  }
  for (const match of text.matchAll(INNGEST_OBJ_RE)) {
    const expr = match[2];
    if (expr !== undefined) addHit(expr, match.index ?? 0);
  }

  return hits;
}

async function parseVercelJson(filePath: string): Promise<CronHit[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)["crons"])
  ) {
    return [];
  }

  const lines = raw.split("\n");
  const hits: CronHit[] = [];
  const crons = (parsed as Record<string, unknown>)["crons"] as unknown[];

  for (const entry of crons) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>)["schedule"] !== "string"
    ) {
      continue;
    }
    const expr: string = (entry as Record<string, string>)["schedule"] ?? "";
    if (expr === "") continue;
    // Find line number by searching for the schedule string in raw text
    const searchStr = `"${expr}"`;
    const idx = raw.indexOf(searchStr);
    const lineNum = idx >= 0 ? raw.slice(0, idx).split("\n").length : 1;
    hits.push({
      expr,
      file: filePath,
      line: lineNum,
      source: "vercel",
      guarded: isGuarded(lines, lineNum - 1),
    });
  }

  return hits;
}

// Matches SELECT cron.schedule('name','<expr>') or cron.schedule('name','<expr>')
const PG_CRON_RE =
  /(?:SELECT\s+)?cron\.schedule\s*\(\s*'[^']*'\s*,\s*'([^']+)'/gi;

async function parseSqlFile(filePath: string): Promise<CronHit[]> {
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split("\n");
  const hits: CronHit[] = [];

  for (const match of text.matchAll(PG_CRON_RE)) {
    const expr = match[1];
    if (expr === undefined) continue;
    const linesBefore = text.slice(0, match.index ?? 0).split("\n");
    const lineNum = linesBefore.length;
    hits.push({
      expr,
      file: filePath,
      line: lineNum,
      source: "pg_cron",
      guarded: isGuarded(lines, lineNum - 1),
    });
  }

  return hits;
}

// Detect node-cron import in a file
const NODE_CRON_IMPORT_RE =
  /import\s+.*from\s+['"]node-cron['"]|require\s*\(\s*['"]node-cron['"]\s*\)/;

// Matches cron.schedule("<expr>") or schedule("<expr>")
const NODE_CRON_CALL_RE =
  /(?:cron\.schedule|(?<!\w)schedule)\s*\(\s*(['"])([^'"]+)\1/g;

async function parseNodeCronFile(filePath: string): Promise<CronHit[]> {
  const text = await fs.readFile(filePath, "utf8");
  if (!NODE_CRON_IMPORT_RE.test(text)) return [];

  const lines = text.split("\n");
  const hits: CronHit[] = [];

  for (const match of text.matchAll(NODE_CRON_CALL_RE)) {
    const expr = match[2];
    if (expr === undefined) continue;
    const linesBefore = text.slice(0, match.index ?? 0).split("\n");
    const lineNum = linesBefore.length;
    hits.push({
      expr,
      file: filePath,
      line: lineNum,
      source: "node-cron",
      guarded: isGuarded(lines, lineNum - 1),
    });
  }

  return hits;
}

export async function findCronHits(workspaceDir: string): Promise<CronHit[]> {
  const hits: CronHit[] = [];

  for await (const filePath of walkFiles(workspaceDir)) {
    const basename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (basename === "vercel.json") {
      const vercelHits = await parseVercelJson(filePath);
      hits.push(...vercelHits);
      continue;
    }

    if (ext === ".sql") {
      const sqlHits = await parseSqlFile(filePath);
      hits.push(...sqlHits);
      continue;
    }

    if (ext === ".ts" || ext === ".js") {
      // Parse as Inngest AND node-cron (both may coexist in different files)
      const inngestHits = await parseInngestFile(filePath);
      hits.push(...inngestHits);

      const nodeCronHits = await parseNodeCronFile(filePath);
      // Avoid double-counting if a file somehow has both patterns
      // node-cron hits only added if they don't duplicate inngest hits at same line
      for (const hit of nodeCronHits) {
        const alreadyCounted = inngestHits.some((h) => h.line === hit.line);
        if (!alreadyCounted) hits.push(hit);
      }
    }
  }

  return hits;
}
