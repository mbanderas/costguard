import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  runAudit,
  resolveSelection,
} from "../../src/orchestrator.js";
import { enabledProviderIds } from "../../src/providers/registry.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { WorkspaceRegistry } from "../../src/registry/schema.js";

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const githubUsageFixture: unknown = require("../fixtures/github/usage-user.json");
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const supabaseProjectsFixture: unknown = require("../fixtures/supabase/projects.json");
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const addonsDeclFixture: unknown = require("../fixtures/supabase/addons-decl.json");
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const addonsOrphFixture: unknown = require("../fixtures/supabase/addons-orph.json");
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const branchesDeclFixture: unknown = require("../fixtures/supabase/branches-decl.json");
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const branchesOrphFixture: unknown = require("../fixtures/supabase/branches-orph.json");

// ---------------------------------------------------------------------------
// Registry/selection helpers
// ---------------------------------------------------------------------------

function makeRegistry(names: string[]): WorkspaceRegistry {
  const workspaces: WorkspaceRegistry["workspaces"] = {};
  for (const name of names) {
    workspaces[name] = {
      providers: ["github", "supabase"],
      active: {
        github: { repo: "mbanderas/gameframe-v2" },
        supabase: {
          projects: ["decl1111"],
          compute: "micro",
          pitr: false,
          branches: [],
        },
      },
    };
  }
  return { root: ".", workspaces };
}

// ---------------------------------------------------------------------------
// Test A: providers dormant without tokens
// ---------------------------------------------------------------------------

describe("runAudit — providers dormant when no tokens in env", () => {
  it("produces zero provider findings when env has no tokens", async () => {
    const registry = makeRegistry(["ws1"]);
    const selection = resolveSelection(registry, ["ws1"], false);

    // Provide a fetcherFactory that throws to verify it is never called
    const findings = await runAudit({
      selection,
      config: DEFAULT_CONFIG,
      flags: { ciOnly: true, cronsOnly: true, providers: "all" },
      fetcherFactory: () => {
        throw new Error("fetcherFactory must not be called without a token");
      },
      env: {},
    });

    // ciOnly+cronsOnly both true means ci/cron blocks are skipped too;
    // with no token the provider block is also dormant => zero findings.
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test B: provider findings appear with fixture fetcher + tokens
// ---------------------------------------------------------------------------

describe("runAudit — provider findings appear with injected fetcher + tokens", () => {
  it("returns github and supabase findings when tokens present and fixture data loaded", async () => {
    const registry = makeRegistry(["ws1"]);
    const selection = resolveSelection(registry, ["ws1"], false);

    const fixtureMap: Record<string, unknown> = {
      // GitHub usage endpoint (user owner type)
      "/users/mbanderas/settings/billing/usage": githubUsageFixture,
      // Supabase endpoints
      "/v1/projects/decl1111/billing/addons": addonsDeclFixture,
      "/v1/projects/orph2222/billing/addons": addonsOrphFixture,
      "/v1/projects/decl1111/branches": branchesDeclFixture,
      "/v1/projects/orph2222/branches": branchesOrphFixture,
      "/v1/projects": supabaseProjectsFixture,
    };

    const findings = await runAudit({
      selection,
      config: DEFAULT_CONFIG,
      flags: { ciOnly: true, cronsOnly: true, providers: "all" },
      fetcherFactory: () => makeFixtureFetcher(fixtureMap),
      env: {
        GITHUB_TOKEN: "x",
        SUPABASE_ACCESS_TOKEN: "y",
      },
    });

    // Must have at least one github finding and one supabase finding
    const githubFindings = findings.filter((f) => f.provider === "github");
    const supabaseFindings = findings.filter((f) => f.provider === "supabase");

    expect(githubFindings.length).toBeGreaterThanOrEqual(1);
    expect(supabaseFindings.length).toBeGreaterThanOrEqual(1);

    // All providers in findings are either github or supabase
    for (const f of findings) {
      expect(["github", "supabase"]).toContain(f.provider);
    }
  });
});

// ---------------------------------------------------------------------------
// Test C: enabledProviderIds filtering logic
// ---------------------------------------------------------------------------

describe("enabledProviderIds", () => {
  it("filters to declared+enabled providers when explicit list given", () => {
    // GITHUB_TOKEN present, no supabase token
    const result = enabledProviderIds(
      ["github", "supabase"],
      ["github", "supabase"],
      { GITHUB_TOKEN: "x" },
    );
    expect(result).toEqual(["github"]);
  });

  it("returns [] when 'all' requested but entry has no enabled providers", () => {
    // Entry declares github only, no token in env
    const result = enabledProviderIds("all", ["github"], {});
    expect(result).toEqual([]);
  });

  it("returns [] when requested id is not in entry providers", () => {
    const result = enabledProviderIds(
      ["supabase"],
      ["github"],
      { SUPABASE_ACCESS_TOKEN: "y" },
    );
    expect(result).toEqual([]);
  });

  it("returns both when both tokens present and both declared", () => {
    const result = enabledProviderIds(
      "all",
      ["github", "supabase"],
      { GITHUB_TOKEN: "x", SUPABASE_ACCESS_TOKEN: "y" },
    );
    expect(result).toEqual(["github", "supabase"]);
  });
});
