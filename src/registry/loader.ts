import fs from "node:fs";
import { registryPath, expandTilde } from "../config.js";
import { WorkspaceRegistrySchema } from "./schema.js";
import type { WorkspaceRegistry } from "./schema.js";

/**
 * Load and validate the registry from disk.
 * Throws a descriptive Error if the file is missing, invalid JSON, or fails schema validation.
 */
export function loadRegistry(p?: string): WorkspaceRegistry {
  const filePath = p ?? registryPath();

  if (!fs.existsSync(filePath)) {
    throw new Error(`Registry file not found: ${filePath}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse registry JSON at ${filePath}: ${msg}`, {
      cause: err,
    });
  }

  const result = WorkspaceRegistrySchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Registry schema validation failed:\n${issues}`);
  }

  return result.data;
}

/**
 * Resolve the registry root to an absolute path, expanding `~` if present.
 */
export function resolvedRoot(reg: WorkspaceRegistry): string {
  return expandTilde(reg.root);
}
