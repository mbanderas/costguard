import fs from "node:fs";
import path from "node:path";
import { PROVIDER_SIGNALS, ENV_ALIAS_PREFIXES } from "./signals.js";

export interface Detection {
  /** Provider id (KNOWN_PROVIDERS member or "inngest"). */
  id: string;
  /** Repo-relative config paths that matched. */
  configFiles: string[];
  /** Dependency names that matched. */
  depPackages: string[];
  /** Env-var NAMES that matched (never values). */
  envVars: string[];
}

export interface DetectOptions {
  /** Env name source (keys only). Defaults to process.env. Pass {} to isolate. */
  env?: Record<string, string | undefined>;
}

/**
 * Detect every provider whose config-file, dependency, or env-var-NAME signal is
 * present in `dir`. Read-only and secret-safe: only env KEY NAMES are read — a
 * value is never parsed, stored, or returned (R10). Results sorted by id.
 */
export function detectProviders(dir: string, opts: DetectOptions = {}): Detection[] {
  const deps = readDepNames(dir);
  const envNames = collectEnvNames(dir, opts.env ?? process.env);

  const detections: Detection[] = [];
  for (const sig of PROVIDER_SIGNALS) {
    const configFiles = (sig.configFiles ?? []).filter((rel) =>
      fs.existsSync(path.join(dir, rel)),
    );
    const depPackages = (sig.depPackages ?? []).filter((d) => matchDep(d, deps));
    const envVars = (sig.envVars ?? []).filter((name) => envNames.has(name));

    if (configFiles.length > 0 || depPackages.length > 0 || envVars.length > 0) {
      detections.push({ id: sig.id, configFiles, depPackages, envVars });
    }
  }

  return detections.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Match a signal against the dependency-name set; supports a "@scope/*" prefix. */
function matchDep(signal: string, deps: ReadonlySet<string>): boolean {
  if (signal.endsWith("/*")) {
    const prefix = signal.slice(0, -1); // keep the trailing "/"
    for (const d of deps) {
      if (d.startsWith(prefix)) return true;
    }
    return false;
  }
  return deps.has(signal);
}

/** Dependency NAMES from package.json (all dependency groups). Versions ignored. */
function readDepNames(dir: string): ReadonlySet<string> {
  const names = new Set<string>();
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return names;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as unknown;
  } catch {
    return names;
  }
  if (typeof raw !== "object" || raw === null) return names;

  const pkg = raw as Record<string, unknown>;
  for (const group of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = pkg[group];
    if (typeof deps === "object" && deps !== null) {
      for (const name of Object.keys(deps as Record<string, unknown>)) names.add(name);
    }
  }
  return names;
}

/**
 * Collect env-var NAMES from the provided env (keys only) plus every .env* file
 * in `dir`. SECURITY: only the part LEFT of the first "=" is read — the value is
 * never touched. Framework-prefixed public names also contribute their stripped
 * base (e.g. NEXT_PUBLIC_SUPABASE_URL -> SUPABASE_URL).
 */
function collectEnvNames(dir: string, env: Record<string, string | undefined>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const key of Object.keys(env)) addEnvName(names, key);

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const base = entry.name;
    if (base !== ".env" && !base.startsWith(".env.")) continue;
    parseEnvFileNames(path.join(dir, base), names);
  }
  return names;
}

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parse only the NAMES from a dotenv file. The value side is never read. */
function parseEnvFileNames(file: string, into: Set<string>): void {
  let content: string;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let name = trimmed.slice(0, eq).trim();
    if (name.startsWith("export ")) name = name.slice("export ".length).trim();
    addEnvName(into, name);
  }
}

/** Add a valid env NAME plus, if framework-prefixed, its stripped base name. */
function addEnvName(into: Set<string>, name: string): void {
  if (!ENV_NAME_RE.test(name)) return;
  into.add(name);
  for (const prefix of ENV_ALIAS_PREFIXES) {
    if (name.startsWith(prefix) && name.length > prefix.length) {
      into.add(name.slice(prefix.length));
    }
  }
}
