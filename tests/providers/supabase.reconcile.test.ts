import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { supabaseModule } from "../../src/providers/supabase/index.js";
import type { Finding } from "../../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "../fixtures/supabase");

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

const projectsFixture = loadFixture("projects.json");
const addonsDeclFixture = loadFixture("addons-decl.json");
const addonsOrphFixture = loadFixture("addons-orph.json");
const branchesDeclFixture = loadFixture("branches-decl.json");
const branchesOrphFixture = loadFixture("branches-orph.json");

function makeArgs(activeSupabase: unknown) {
  return {
    ctx: {
      workspace: "web-app",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "web-app"),
    },
    entry: {
      providers: ["supabase"],
      active: {
        supabase: activeSupabase,
      },
    },
    fetcher: makeFixtureFetcher({
      "/v1/projects/decl1111/billing/addons": addonsDeclFixture,
      "/v1/projects/orph2222/billing/addons": addonsOrphFixture,
      "/v1/projects/decl1111/branches": branchesDeclFixture,
      "/v1/projects/orph2222/branches": branchesOrphFixture,
      "/v1/projects": projectsFixture,
    }),
    config: DEFAULT_CONFIG,
  };
}

function hasAllFields(f: Finding): boolean {
  return (
    typeof f.workspace === "string" &&
    typeof f.provider === "string" &&
    typeof f.rule === "string" &&
    (f.severity === "info" || f.severity === "warn" || f.severity === "high") &&
    typeof f.estMonthlyUsd === "number" &&
    typeof f.title === "string" &&
    typeof f.detail === "string" &&
    typeof f.fix === "string" &&
    typeof f.autofixable === "boolean"
  );
}

describe("supabaseModule.check — main scenario", () => {
  it("returns expected findings for declared+orphaned setup", async () => {
    const activeConfig = {
      projects: ["decl1111"],
      compute: "micro",
      pitr: false,
      branches: [],
    };

    const findings = await supabaseModule.check(makeArgs(activeConfig));

    // All findings have all 9 fields
    for (const f of findings) {
      expect(hasAllFields(f)).toBe(true);
    }

    // All findings are for supabase provider
    for (const f of findings) {
      expect(f.provider).toBe("supabase");
    }

    // All findings are not autofixable
    for (const f of findings) {
      expect(f.autofixable).toBe(false);
    }

    const rules = findings.map((f) => f.rule);

    // orphaned-project for orph2222
    const orphanedProject = findings.find(
      (f) => f.rule === "supabase/orphaned-project",
    );
    expect(orphanedProject).toBeDefined();
    expect(orphanedProject?.severity).toBe("high");
    expect(orphanedProject?.detail).toContain("orph2222");

    // over-provisioned-compute (decl1111 is running "small", declared is "micro", delta=15)
    const overProvisioned = findings.find(
      (f) => f.rule === "supabase/over-provisioned-compute",
    );
    expect(overProvisioned).toBeDefined();
    expect(overProvisioned?.severity).toBe("warn");
    expect(overProvisioned?.estMonthlyUsd).toBe(15);

    // pitr-undeclared (decl1111 has pitr enabled, active.pitr is false)
    const pitrUndeclared = findings.find(
      (f) => f.rule === "supabase/pitr-undeclared",
    );
    expect(pitrUndeclared).toBeDefined();
    expect(pitrUndeclared?.severity).toBe("warn");
    expect(pitrUndeclared?.estMonthlyUsd).toBe(100);

    // orphaned-branch for feature-x on decl1111
    const orphanedBranch = findings.find(
      (f) => f.rule === "supabase/orphaned-branch",
    );
    expect(orphanedBranch).toBeDefined();
    expect(orphanedBranch?.severity).toBe("warn");
    expect(orphanedBranch?.estMonthlyUsd).toBe(3.9);
    expect(orphanedBranch?.detail).toContain("feature-x");

    // Verify all 4 rules are present
    expect(rules).toContain("supabase/orphaned-project");
    expect(rules).toContain("supabase/over-provisioned-compute");
    expect(rules).toContain("supabase/pitr-undeclared");
    expect(rules).toContain("supabase/orphaned-branch");
  });
});

describe("supabaseModule.check — clean case", () => {
  it("returns 0 findings when active matches live", async () => {
    // decl1111 is small with pitr enabled, feature-x branch
    // orph2222 declared as well (so not orphaned)
    const activeConfig = {
      projects: ["decl1111", "orph2222"],
      compute: "small",
      pitr: true,
      branches: ["feature-x"],
    };

    const findings = await supabaseModule.check(makeArgs(activeConfig));

    expect(findings).toHaveLength(0);
  });
});

describe("supabaseModule.check — absent active", () => {
  it("returns [] when supabase active entry is absent", async () => {
    const args = {
      ctx: {
        workspace: "web-app",
        workspaceDir: ".",
        config: resolveWorkspaceConfig(DEFAULT_CONFIG, "web-app"),
      },
      entry: {
        providers: ["supabase"],
        active: {},
      },
      fetcher: makeFixtureFetcher({}),
      config: DEFAULT_CONFIG,
    };

    const findings = await supabaseModule.check(args);
    expect(findings).toHaveLength(0);
  });
});
