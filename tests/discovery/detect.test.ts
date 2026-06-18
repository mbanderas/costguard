import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectProviders } from "../../src/discovery/detect.js";

// ---------------------------------------------------------------------------
// Phase B auto-discovery: detect all 13 wired providers + inngest from repo
// signals (config files, package.json deps, env-var NAMES). SECURITY (R10):
// env VALUES are never read, never appear in any Detection. Tests pass an empty
// env so only the in-dir signal under test fires (no host-env leakage).
// ---------------------------------------------------------------------------

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cg-discover-"));
});

afterEach(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

function write(rel: string, content = ""): void {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

function mkdir(rel: string): void {
  fs.mkdirSync(path.join(dir, rel), { recursive: true });
}

function pkg(deps: Record<string, string>): void {
  write("package.json", JSON.stringify({ name: "fx", dependencies: deps }));
}

function detect(): string[] {
  return detectProviders(dir, { env: {} }).map((d) => d.id);
}

// One minimal signal per provider — at least one of config-file / dep / env-name.
describe("detectProviders — one failing-first signal per provider", () => {
  it("github via .github/workflows dir", () => {
    mkdir(".github/workflows");
    expect(detect()).toContain("github");
  });

  it("supabase via supabase/config.toml", () => {
    write("supabase/config.toml");
    expect(detect()).toContain("supabase");
  });

  it("railway via railway.toml", () => {
    write("railway.toml");
    expect(detect()).toContain("railway");
  });

  it("netlify via netlify.toml", () => {
    write("netlify.toml");
    expect(detect()).toContain("netlify");
  });

  it("neon via @neondatabase/serverless dep", () => {
    pkg({ "@neondatabase/serverless": "^0.9.0" });
    expect(detect()).toContain("neon");
  });

  it("vercel via vercel.json", () => {
    write("vercel.json", "{}");
    expect(detect()).toContain("vercel");
  });

  it("inngest via inngest.config.ts", () => {
    write("inngest.config.ts");
    expect(detect()).toContain("inngest");
  });

  it("sentry via .sentryclirc", () => {
    write(".sentryclirc");
    expect(detect()).toContain("sentry");
  });

  it("upstash via UPSTASH_REDIS_REST_URL env name in .env", () => {
    write(".env", "UPSTASH_REDIS_REST_URL=redacted-value\n");
    expect(detect()).toContain("upstash");
  });

  it("atlas via MONGODB_ATLAS_PUBLIC_API_KEY env name in .env", () => {
    write(".env", "MONGODB_ATLAS_PUBLIC_API_KEY=redacted\n");
    expect(detect()).toContain("atlas");
  });

  it("cloudflare via wrangler.toml", () => {
    write("wrangler.toml");
    expect(detect()).toContain("cloudflare");
  });

  it("fly via fly.toml", () => {
    write("fly.toml");
    expect(detect()).toContain("fly");
  });

  it("render via render.yaml", () => {
    write("render.yaml");
    expect(detect()).toContain("render");
  });

  it("datadog via dd-trace dep", () => {
    pkg({ "dd-trace": "^5.0.0" });
    expect(detect()).toContain("datadog");
  });
});

describe("detectProviders — env-name aliases and security", () => {
  it("matches supabase via a NEXT_PUBLIC_ prefixed alias name", () => {
    write(".env", "NEXT_PUBLIC_SUPABASE_URL=redacted\n");
    expect(detect()).toContain("supabase");
  });

  it("NEVER includes an env VALUE in any Detection (R10)", () => {
    const secret = "placeholder-not-a-real-value";
    write(".env", `SENTRY_DSN=${secret}\n`);
    const result = detectProviders(dir, { env: {} });
    const blob = JSON.stringify(result);
    expect(blob).not.toContain(secret);
    expect(result.map((d) => d.id)).toContain("sentry");
    // evidence records the NAME, not the value
    const sentry = result.find((d) => d.id === "sentry");
    expect(sentry?.envVars).toContain("SENTRY_DSN");
  });

  it("ignores commented and blank lines in .env", () => {
    write(".env", "# UPSTASH_REDIS_REST_URL=should-not-count\n\n");
    expect(detect()).not.toContain("upstash");
  });
});

describe("detectProviders — multi-provider repo + determinism", () => {
  it("detects several providers in one dir, sorted by id", () => {
    write("vercel.json", "{}");
    pkg({ "@neondatabase/serverless": "^0.9.0" });
    write(".env", "UPSTASH_REDIS_REST_TOKEN=redacted\n");
    const ids = detect();
    expect(ids).toContain("vercel");
    expect(ids).toContain("neon");
    expect(ids).toContain("upstash");
    expect([...ids]).toEqual([...ids].sort());
  });

  it("empty dir detects nothing", () => {
    expect(detect()).toEqual([]);
  });
});
