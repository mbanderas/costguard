import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { neonModule } from "../../src/providers/neon/index.js";
import type { Finding } from "../../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "../fixtures/neon");

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

const projectsFixture = loadFixture("projects.json");
const branchesDecl1Fixture = loadFixture("branches-decl1.json");
const projectDecl1Fixture = loadFixture("project-decl1.json");

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

describe("neonModule.check — main scenario", () => {
  it("returns orphaned-project, idle-branch, and compute-overage findings", async () => {
    const args = {
      ctx: {
        workspace: "api-service",
        workspaceDir: ".",
        config: resolveWorkspaceConfig(DEFAULT_CONFIG, "api-service"),
      },
      entry: {
        providers: ["neon"],
        active: {
          neon: { projects: ["decl1"], branches: [] },
        },
      },
      fetcher: makeFixtureFetcher({
        "/api/v2/projects/decl1/branches": branchesDecl1Fixture,
        "/api/v2/projects/decl1": projectDecl1Fixture,
        "/api/v2/projects": projectsFixture,
      }),
      config: DEFAULT_CONFIG,
    };

    const findings = await neonModule.check(args);

    // All 9 fields present on every finding
    for (const f of findings) {
      expect(hasAllFields(f)).toBe(true);
    }

    // All findings are for neon provider
    for (const f of findings) {
      expect(f.provider).toBe("neon");
    }

    // None are autofixable
    for (const f of findings) {
      expect(f.autofixable).toBe(false);
    }

    const rules = findings.map((f) => f.rule);

    // orphaned-project for orph9/ghost-db
    const orphaned = findings.find((f) => f.rule === "neon/orphaned-project");
    expect(orphaned).toBeDefined();
    expect(orphaned?.severity).toBe("high");
    expect(orphaned?.detail).toContain("orph9");
    expect(orphaned?.detail).toContain("ghost-db");

    // idle-branch for preview-x on decl1
    const idleBranch = findings.find((f) => f.rule === "neon/idle-branch");
    expect(idleBranch).toBeDefined();
    expect(idleBranch?.severity).toBe("warn");
    expect(idleBranch?.detail).toContain("preview-x");

    // compute-overage: 250h used, 191.9h free => ~9.30 USD
    const overage = findings.find((f) => f.rule === "neon/compute-overage");
    expect(overage).toBeDefined();
    expect(overage?.severity).toBe("warn");
    expect(overage?.estMonthlyUsd).toBeCloseTo(9.296, 1);

    expect(rules).toContain("neon/orphaned-project");
    expect(rules).toContain("neon/idle-branch");
    expect(rules).toContain("neon/compute-overage");
  });
});

describe("neonModule.check — clean case", () => {
  it("returns 0 findings when everything is declared and under free tier", async () => {
    // Use a low-compute fixture inline: 100h (under 191.9h free)
    const lowComputeFixture = { compute_time_seconds: 360000 }; // 100h

    const args = {
      ctx: {
        workspace: "api-service",
        workspaceDir: ".",
        config: resolveWorkspaceConfig(DEFAULT_CONFIG, "api-service"),
      },
      entry: {
        providers: ["neon"],
        active: {
          neon: { projects: ["decl1", "orph9"], branches: ["preview-x"] },
        },
      },
      fetcher: makeFixtureFetcher({
        "/api/v2/projects/decl1/branches": branchesDecl1Fixture,
        "/api/v2/projects/decl1": lowComputeFixture,
        "/api/v2/projects/orph9/branches": { branches: [{ id: "b3", name: "main", default: true }] },
        "/api/v2/projects/orph9": lowComputeFixture,
        "/api/v2/projects": projectsFixture,
      }),
      config: DEFAULT_CONFIG,
    };

    const findings = await neonModule.check(args);
    expect(findings).toHaveLength(0);
  });
});

describe("neonModule.check — absent active", () => {
  it("returns [] when neon active entry is absent", async () => {
    const args = {
      ctx: {
        workspace: "api-service",
        workspaceDir: ".",
        config: resolveWorkspaceConfig(DEFAULT_CONFIG, "api-service"),
      },
      entry: {
        providers: ["neon"],
        active: {},
      },
      fetcher: makeFixtureFetcher({}),
      config: DEFAULT_CONFIG,
    };

    const findings = await neonModule.check(args);
    expect(findings).toHaveLength(0);
  });
});
