import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scanWorkspaces, writeRegistry } from "../src/registry/init.js";
import { loadRegistry } from "../src/registry/loader.js";
import { validateRegistry } from "../src/registry/validate.js";
import type { WorkspaceRegistry } from "../src/registry/schema.js";

// ---------------------------------------------------------------------------
// Temp dir fixture helpers
// ---------------------------------------------------------------------------

let tempRoot: string;

function mkDir(...parts: string[]): void {
  fs.mkdirSync(path.join(tempRoot, ...parts), { recursive: true });
}

function mkFile(relPath: string, content: string): void {
  const full = path.join(tempRoot, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "costguard-test-"));

  // ws-github: has .github/workflows/
  mkDir("ws-github", ".github", "workflows");

  // ws-vercel: has vercel.json
  mkFile("ws-vercel/vercel.json", "{}");

  // ws-supabase: has supabase/
  mkDir("ws-supabase", "supabase");

  // ws-inngest: has package.json with inngest dep
  mkFile(
    "ws-inngest/package.json",
    JSON.stringify({ dependencies: { inngest: "^3.0.0" } }),
  );

  // ws-empty: just a directory, no signals
  mkDir("ws-empty");
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// scanWorkspaces
// ---------------------------------------------------------------------------

describe("scanWorkspaces", () => {
  it("detects github provider from .github/workflows", () => {
    const reg = scanWorkspaces(tempRoot);
    expect(reg.workspaces["ws-github"]?.providers).toEqual(["github"]);
  });

  it("detects vercel provider from vercel.json", () => {
    const reg = scanWorkspaces(tempRoot);
    expect(reg.workspaces["ws-vercel"]?.providers).toEqual(["vercel"]);
  });

  it("detects supabase provider from supabase/ dir", () => {
    const reg = scanWorkspaces(tempRoot);
    expect(reg.workspaces["ws-supabase"]?.providers).toEqual(["supabase"]);
  });

  it("detects inngest from package.json dependencies", () => {
    const reg = scanWorkspaces(tempRoot);
    expect(reg.workspaces["ws-inngest"]?.providers).toEqual(["inngest"]);
  });

  it("returns empty providers for empty workspace", () => {
    const reg = scanWorkspaces(tempRoot);
    expect(reg.workspaces["ws-empty"]?.providers).toEqual([]);
  });

  it("returns all workspaces with blank active", () => {
    const reg = scanWorkspaces(tempRoot);
    for (const entry of Object.values(reg.workspaces)) {
      expect(entry.active).toEqual({});
    }
  });

  it("stores workspace keys sorted alphabetically", () => {
    const reg = scanWorkspaces(tempRoot);
    const keys = Object.keys(reg.workspaces);
    expect(keys).toEqual([...keys].sort());
  });

  it("stores root as the literal string passed in", () => {
    const reg = scanWorkspaces(tempRoot);
    expect(reg.root).toBe(tempRoot);
  });

  it("detects netlify from netlify.toml", () => {
    mkFile("ws-netlify/netlify.toml", "[build]");
    const reg = scanWorkspaces(tempRoot);
    expect(reg.workspaces["ws-netlify"]?.providers).toEqual(["netlify"]);
  });

  it("detects railway from railway.toml", () => {
    mkFile("ws-railway/railway.toml", "");
    const reg = scanWorkspaces(tempRoot);
    expect(reg.workspaces["ws-railway"]?.providers).toEqual(["railway"]);
  });

  it("detects multiple providers for a workspace", () => {
    mkDir("ws-multi", ".github", "workflows");
    mkDir("ws-multi", "supabase");
    mkFile("ws-multi/netlify.toml", "");
    const reg = scanWorkspaces(tempRoot);
    // sorted: github, netlify, supabase
    expect(reg.workspaces["ws-multi"]?.providers).toEqual([
      "github",
      "netlify",
      "supabase",
    ]);
  });

  it("detects inngest from devDependencies", () => {
    mkFile(
      "ws-inngest-dev/package.json",
      JSON.stringify({ devDependencies: { inngest: "^3.0.0" } }),
    );
    const reg = scanWorkspaces(tempRoot);
    expect(reg.workspaces["ws-inngest-dev"]?.providers).toEqual(["inngest"]);
  });
});

// ---------------------------------------------------------------------------
// loader round-trip
// ---------------------------------------------------------------------------

describe("loadRegistry", () => {
  it("round-trips a written registry", () => {
    const reg = scanWorkspaces(tempRoot);
    const outPath = path.join(tempRoot, "workspaces.json");
    writeRegistry(reg, outPath);
    const loaded = loadRegistry(outPath);
    expect(loaded).toEqual(reg);
  });

  it("throws when file does not exist", () => {
    expect(() => loadRegistry(path.join(tempRoot, "nonexistent.json"))).toThrow(
      /not found/i,
    );
  });

  it("throws on malformed JSON", () => {
    const badPath = path.join(tempRoot, "bad.json");
    fs.writeFileSync(badPath, "{ not json }", "utf8");
    expect(() => loadRegistry(badPath)).toThrow(/parse/i);
  });

  it("throws on schema mismatch (missing root)", () => {
    const badPath = path.join(tempRoot, "bad.json");
    fs.writeFileSync(badPath, JSON.stringify({ workspaces: {} }), "utf8");
    expect(() => loadRegistry(badPath)).toThrow(/schema validation failed/i);
  });
});

// ---------------------------------------------------------------------------
// validateRegistry
// ---------------------------------------------------------------------------

describe("validateRegistry", () => {
  function writeValidRegistry(extra?: Partial<WorkspaceRegistry>): string {
    const reg: WorkspaceRegistry = {
      root: tempRoot,
      workspaces: {
        "ws-github": { providers: ["github"], active: {} },
      },
      ...extra,
    };
    const outPath = path.join(tempRoot, "workspaces.json");
    fs.writeFileSync(outPath, JSON.stringify(reg, null, 2), "utf8");
    return outPath;
  }

  it("returns ok for a valid registry", () => {
    const p = writeValidRegistry();
    const result = validateRegistry(p);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error when registry file does not exist", () => {
    const result = validateRegistry(path.join(tempRoot, "missing.json"));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /not found/i.test(e))).toBe(true);
  });

  it("returns error for malformed JSON", () => {
    const badPath = path.join(tempRoot, "bad.json");
    fs.writeFileSync(badPath, "{ bad json }", "utf8");
    const result = validateRegistry(badPath);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /invalid json/i.test(e))).toBe(true);
  });

  it("returns error when a workspace directory is missing", () => {
    const outPath = path.join(tempRoot, "workspaces.json");
    const reg: WorkspaceRegistry = {
      root: tempRoot,
      workspaces: {
        "ws-github": { providers: ["github"], active: {} },
        "ws-ghost": { providers: [], active: {} }, // does not exist on disk
      },
    };
    fs.writeFileSync(outPath, JSON.stringify(reg, null, 2), "utf8");
    const result = validateRegistry(outPath);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /ws-ghost/i.test(e))).toBe(true);
  });

  it("returns error for unknown provider", () => {
    const outPath = path.join(tempRoot, "workspaces.json");
    const reg = {
      root: tempRoot,
      workspaces: {
        "ws-github": { providers: ["github", "aws"], active: {} },
      },
    };
    fs.writeFileSync(outPath, JSON.stringify(reg, null, 2), "utf8");
    const result = validateRegistry(outPath);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /aws/i.test(e))).toBe(true);
  });
});
