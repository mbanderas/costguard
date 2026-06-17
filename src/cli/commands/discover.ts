import fs from "node:fs";
import path from "node:path";
import { registryPath } from "../../config.js";
import { detectProviders, type Detection } from "../../discovery/detect.js";
import { loadRegistry } from "../../registry/loader.js";
import { writeRegistry } from "../../registry/init.js";
import type { WorkspaceRegistry } from "../../registry/schema.js";

export interface DiscoverOptions {
  dir: string;
  json: boolean;
  write: boolean;
}

/**
 * Detect providers in `dir` and report them; optionally merge into ./workspaces.json.
 * Read-only and secret-safe (R10): detection reads env KEY NAMES only — values are
 * never read, so nothing sensitive can reach stdout or the registry file.
 */
export async function runDiscover(opts: DiscoverOptions): Promise<void> {
  const absDir = path.resolve(opts.dir);
  const detections = detectProviders(absDir);
  const providers = detections.map((d) => d.id);

  if (opts.json) {
    console.log(JSON.stringify({ dir: absDir, providers, detections }, null, 2));
  } else {
    renderHuman(absDir, detections);
  }

  if (opts.write) {
    const result = mergeIntoRegistry(absDir, providers);
    // Summary to stderr so --json stdout stays a clean JSON document.
    const wasNote =
      result.existed ? `union with existing (was: ${result.before.join(", ") || "none"})` : "new entry";
    console.error(
      `Wrote ${result.after.length} provider(s) for "${result.name}" to ${result.path} — ${wasNote}`,
    );
  }
}

function renderHuman(absDir: string, detections: Detection[]): void {
  console.log(`Discovered providers in ${absDir}:`);
  if (detections.length === 0) {
    console.log("  (none detected)");
    return;
  }
  for (const d of detections) {
    const evidence: string[] = [];
    if (d.configFiles.length > 0) evidence.push(`config: ${d.configFiles.join(", ")}`);
    if (d.depPackages.length > 0) evidence.push(`deps: ${d.depPackages.join(", ")}`);
    if (d.envVars.length > 0) evidence.push(`env names: ${d.envVars.join(", ")}`);
    console.log(`  - ${d.id} (${evidence.join("; ")})`);
  }
  console.log("\nEnv VALUES are never read or printed — only names.");
}

interface MergeResult {
  path: string;
  name: string;
  existed: boolean;
  before: string[];
  after: string[];
}

/**
 * Non-destructive merge: union detected providers into the entry for
 * basename(dir), preserving any existing providers and the `active` block, and
 * leaving every other workspace untouched. Creates the registry if absent.
 */
function mergeIntoRegistry(absDir: string, detected: string[]): MergeResult {
  const outPath = registryPath();
  const name = path.basename(absDir);

  const reg: WorkspaceRegistry = fs.existsSync(outPath)
    ? loadRegistry(outPath)
    : { root: path.dirname(absDir), workspaces: {} };

  const existing = reg.workspaces[name];
  const before = existing ? [...existing.providers] : [];
  const after = Array.from(new Set([...before, ...detected])).sort();

  reg.workspaces[name] = { providers: after, active: existing?.active ?? {} };

  const sorted: WorkspaceRegistry["workspaces"] = {};
  for (const key of Object.keys(reg.workspaces).sort()) {
    sorted[key] = reg.workspaces[key]!;
  }
  reg.workspaces = sorted;

  writeRegistry(reg, outPath);
  return { path: outPath, name, existed: existing !== undefined, before, after };
}
