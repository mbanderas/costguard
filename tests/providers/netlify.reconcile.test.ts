import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { netlifyModule } from "../../src/providers/netlify/index.js";
import type { Finding } from "../../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "../fixtures/netlify");

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

const sitesFixture = loadFixture("sites.json");
const bandwidthFixture = loadFixture("bandwidth.json");
const buildsFixture = loadFixture("builds.json");

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

function makeArgs(activeNetlify: unknown) {
  return {
    ctx: {
      workspace: "ApexSite",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "ApexSite"),
    },
    entry: {
      providers: ["netlify"],
      active: { netlify: activeNetlify },
    },
    fetcher: makeFixtureFetcher({
      "/api/v1/sites": sitesFixture,
      "/accounts/team1/bandwidth": bandwidthFixture,
      "/accounts/team1/builds/status": buildsFixture,
    }),
    config: DEFAULT_CONFIG,
  };
}

describe("netlifyModule.check — main scenario", () => {
  it("returns orphaned-site, build-minutes, and bandwidth-overage findings", async () => {
    const activeConfig = {
      sites: ["mysite"],
      accountSlug: "team1",
    };

    const findings = await netlifyModule.check(makeArgs(activeConfig));

    for (const f of findings) {
      expect(hasAllFields(f)).toBe(true);
    }

    for (const f of findings) {
      expect(f.provider).toBe("netlify");
    }

    for (const f of findings) {
      expect(f.autofixable).toBe(false);
    }

    const rules = findings.map((f) => f.rule);
    expect(rules).toContain("netlify/orphaned-site");
    expect(rules).toContain("netlify/build-minutes");
    expect(rules).toContain("netlify/bandwidth-overage");

    const orphaned = findings.find((f) => f.rule === "netlify/orphaned-site");
    expect(orphaned).toBeDefined();
    expect(orphaned?.severity).toBe("high");
    expect(orphaned?.detail).toContain("old-demo");

    const buildMins = findings.find((f) => f.rule === "netlify/build-minutes");
    expect(buildMins).toBeDefined();
    expect(buildMins?.severity).toBe("warn");
    // 350-300=50 overage * 0.007 = 0.35
    expect(buildMins?.estMonthlyUsd).toBeCloseTo(0.35, 10);

    const bw = findings.find((f) => f.rule === "netlify/bandwidth-overage");
    expect(bw).toBeDefined();
    expect(bw?.severity).toBe("warn");
    // 150-100=50 GB * 0.20 = 10
    expect(bw?.estMonthlyUsd).toBe(10);
  });
});

describe("netlifyModule.check — clean case", () => {
  it("returns 0 findings when all sites declared and no accountSlug", async () => {
    const activeConfig = {
      sites: ["mysite", "old-demo"],
      // no accountSlug — bandwidth and build usage not fetched
    };

    const findings = await netlifyModule.check(makeArgs(activeConfig));
    expect(findings).toHaveLength(0);
  });
});

describe("netlifyModule.check — absent active", () => {
  it("returns [] when netlify active entry is absent", async () => {
    const args = {
      ctx: {
        workspace: "ApexSite",
        workspaceDir: ".",
        config: resolveWorkspaceConfig(DEFAULT_CONFIG, "ApexSite"),
      },
      entry: {
        providers: ["netlify"],
        active: {},
      },
      fetcher: makeFixtureFetcher({}),
      config: DEFAULT_CONFIG,
    };

    const findings = await netlifyModule.check(args);
    expect(findings).toHaveLength(0);
  });
});
