import fs from "node:fs";
import path from "node:path";
import { registryPath } from "../config.js";
import type { WorkspaceRegistry, WorkspaceEntry } from "./schema.js";

/**
 * Detect providers for a single workspace directory using fixed static signals.
 * Returns providers sorted alphabetically for deterministic output.
 *
 * NOTE [F9, deferred per loop D-g5]: src/discovery/detect.ts has a broader,
 * signal-table detector. Delegating to it was considered but deferred: that detector
 * is env-aware (defaults to process.env and reads `.env*` files in the dir), whereas
 * this scan must stay a deterministic file/dep-only detector — its output is the
 * committed workspaces.json source of truth and must not vary with machine env or
 * the presence of a `.env.example`. The two serve different contracts; merging them
 * is out of scope for the site-cost review loop. Duplication is acknowledged here.
 */
function detectProviders(wsDir: string): string[] {
  const providers: string[] = [];

  if (fs.existsSync(path.join(wsDir, ".github", "workflows"))) {
    providers.push("github");
  }

  if (fs.existsSync(path.join(wsDir, "supabase"))) {
    providers.push("supabase");
  }

  if (
    fs.existsSync(path.join(wsDir, "railway.toml")) ||
    fs.existsSync(path.join(wsDir, "railway.json"))
  ) {
    providers.push("railway");
  }

  if (
    fs.existsSync(path.join(wsDir, "netlify.toml")) ||
    fs.existsSync(path.join(wsDir, "netlify"))
  ) {
    providers.push("netlify");
  }

  if (fs.existsSync(path.join(wsDir, "vercel.json"))) {
    providers.push("vercel");
  }

  if (hasInngest(wsDir)) {
    providers.push("inngest");
  }

  return providers.sort();
}

function hasInngest(wsDir: string): boolean {
  const pkgPath = path.join(wsDir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as unknown;
  } catch {
    return false;
  }

  if (typeof raw !== "object" || raw === null) return false;
  const pkg = raw as Record<string, unknown>;

  return (
    hasDep(pkg["dependencies"]) ||
    hasDep(pkg["devDependencies"])
  );
}

function hasDep(deps: unknown): boolean {
  if (typeof deps !== "object" || deps === null) return false;
  return "inngest" in (deps as Record<string, unknown>);
}

/**
 * Scan immediate child directories of `root` and build a WorkspaceRegistry.
 * Root is stored as the literal string passed in (keep "~/Workspaces" tilde form).
 * Workspace keys and provider lists are sorted for deterministic output.
 */
export function scanWorkspaces(root: string): WorkspaceRegistry {
  const absRoot = root.startsWith("~")
    ? path.join(
        process.env["HOME"] ?? process.env["USERPROFILE"] ?? root,
        root.slice(1),
      )
    : root;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absRoot, { withFileTypes: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read workspaces root "${absRoot}": ${msg}`, {
      cause: err,
    });
  }

  const workspaces: Record<string, WorkspaceEntry> = {};

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const wsDir = path.join(absRoot, name);
    const providers = detectProviders(wsDir);
    workspaces[name] = { providers, active: {} };
  }

  const sortedWorkspaces: Record<string, WorkspaceEntry> = {};
  for (const key of Object.keys(workspaces).sort()) {
    const ws = workspaces[key];
    if (ws !== undefined) {
      sortedWorkspaces[key] = ws;
    }
  }

  return { root, workspaces: sortedWorkspaces };
}

/**
 * Write a WorkspaceRegistry to disk as formatted JSON.
 * Default path: registryPath() (cwd/workspaces.json).
 */
export function writeRegistry(reg: WorkspaceRegistry, p?: string): void {
  const filePath = p ?? registryPath();
  fs.writeFileSync(filePath, JSON.stringify(reg, null, 2) + "\n", "utf8");
}
