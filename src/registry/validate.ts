import fs from "node:fs";
import path from "node:path";
import { registryPath } from "../config.js";
import { WorkspaceRegistrySchema, KNOWN_PROVIDERS } from "./schema.js";
import { resolvedRoot } from "./loader.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate the registry file at `p` (default: registryPath()).
 * Never throws — collects all issues and returns them.
 */
export function validateRegistry(p?: string): ValidationResult {
  const filePath = p ?? registryPath();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(filePath)) {
    return { ok: false, errors: [`Registry file not found: ${filePath}`], warnings };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Invalid JSON: ${msg}`);
    return { ok: false, errors, warnings };
  }

  const result = WorkspaceRegistrySchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`Schema: ${issue.path.join(".")}: ${issue.message}`);
    }
    return { ok: false, errors, warnings };
  }

  const reg = result.data;
  const root = resolvedRoot(reg);

  for (const [name, entry] of Object.entries(reg.workspaces)) {
    const wsDir = path.join(root, name);
    if (!fs.existsSync(wsDir)) {
      errors.push(`Workspace directory not found: ${wsDir} (workspace: "${name}")`);
    }

    const knownSet: ReadonlySet<string> = new Set(KNOWN_PROVIDERS);
    for (const provider of entry.providers) {
      if (!knownSet.has(provider)) {
        errors.push(`Unknown provider "${provider}" in workspace "${name}"`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
