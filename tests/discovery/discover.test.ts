import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDiscover } from "../../src/cli/commands/discover.js";

// ---------------------------------------------------------------------------
// `discover` subcommand core: multi-provider repo proof + non-destructive
// --write merge. Secret-safe (R10): env VALUES never reach stdout or the file.
// ---------------------------------------------------------------------------

let dir: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cg-discover-cmd-"));
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

function stdout(): string {
  return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
}

function write(rel: string, content = ""): void {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

const SECRET = "do-not-leak-9f3a";

function multiProviderFixture(): void {
  write("vercel.json", "{}");
  write("wrangler.toml");
  write("package.json", JSON.stringify({ dependencies: { "@neondatabase/serverless": "^0.9", "dd-trace": "^5" } }));
  write(".env", `UPSTASH_REDIS_REST_TOKEN=${SECRET}\nSENTRY_DSN=https://abc@o0.ingest.sentry.io/${SECRET}\n`);
}

describe("runDiscover — multi-provider repo (JSON)", () => {
  it("detects every wired provider present and never leaks an env value", async () => {
    multiProviderFixture();
    await runDiscover({ dir, json: true, write: false });

    const out = stdout();
    expect(out).not.toContain(SECRET);

    const parsed = JSON.parse(out) as { providers: string[] };
    for (const id of ["cloudflare", "datadog", "neon", "sentry", "upstash", "vercel"]) {
      expect(parsed.providers).toContain(id);
    }
    expect([...parsed.providers]).toEqual([...parsed.providers].sort());
  });
});

describe("runDiscover --write — non-destructive registry merge", () => {
  const origCwd = process.cwd();
  afterEach(() => process.chdir(origCwd));

  it("creates workspaces.json with detected providers when none exists", async () => {
    multiProviderFixture();
    process.chdir(dir);
    await runDiscover({ dir: ".", json: false, write: true });

    const reg = JSON.parse(fs.readFileSync(path.join(dir, "workspaces.json"), "utf8")) as {
      workspaces: Record<string, { providers: string[]; active: Record<string, unknown> }>;
    };
    const name = path.basename(dir);
    expect(reg.workspaces[name]?.providers).toContain("vercel");
    expect(reg.workspaces[name]?.providers).toContain("neon");
    // no value leaked into the written file
    expect(JSON.stringify(reg)).not.toContain(SECRET);
  });

  it("unions with existing providers and preserves active + other workspaces", async () => {
    multiProviderFixture();
    const name = path.basename(dir);
    const existing = {
      root: path.dirname(dir),
      workspaces: {
        [name]: { providers: ["github"], active: { github: { note: "manual" } } },
        "other-ws": { providers: ["railway"], active: {} },
      },
    };
    write("workspaces.json", JSON.stringify(existing, null, 2));
    process.chdir(dir);

    await runDiscover({ dir: ".", json: false, write: true });

    const reg = JSON.parse(fs.readFileSync(path.join(dir, "workspaces.json"), "utf8")) as {
      workspaces: Record<string, { providers: string[]; active: Record<string, unknown> }>;
    };
    // manual provider preserved + detected unioned
    expect(reg.workspaces[name]?.providers).toContain("github");
    expect(reg.workspaces[name]?.providers).toContain("vercel");
    // active block untouched
    expect(reg.workspaces[name]?.active).toEqual({ github: { note: "manual" } });
    // unrelated workspace untouched
    expect(reg.workspaces["other-ws"]?.providers).toEqual(["railway"]);
  });
});
