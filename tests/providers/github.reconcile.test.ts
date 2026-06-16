import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { githubModule } from "../../src/providers/github/index.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { DEFAULT_CONFIG } from "../../src/config.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const usageFixture: unknown = require("../fixtures/github/usage-user.json");

const BASE_CTX = {
  workspace: "gameframe-v2",
  workspaceDir: ".",
  config: {
    cronThresholdMinutes: 15,
    ciMinuteRate: 0.008,
    assumedPushesPerDay: 10,
    assumedMinutesPerRun: 5,
  },
};

const BASE_ENTRY = {
  providers: ["github"],
  active: {
    github: { repo: "mbanderas/gameframe-v2" },
  },
};

// Fixture fetcher: org endpoint returns 404, user endpoint returns fixture data
const fetcher = makeFixtureFetcher({
  "/users/mbanderas/settings/billing/usage": usageFixture,
});

describe("githubModule.check — over-budget + orphan scenario", () => {
  it("returns 2 findings: one over-budget (high) and one orphaned-repo-spend (warn)", async () => {
    const findings = await githubModule.check({
      ctx: BASE_CTX,
      entry: BASE_ENTRY,
      fetcher,
      config: DEFAULT_CONFIG,
    });

    expect(findings).toHaveLength(2);

    const overBudget = findings.find((f) => f.rule === "github/actions-over-budget");
    const orphan = findings.find((f) => f.rule === "github/orphaned-repo-spend");

    expect(overBudget).toBeDefined();
    expect(orphan).toBeDefined();

    // over-budget finding assertions
    expect(overBudget?.severity).toBe("high");
    expect(overBudget?.provider).toBe("github");
    expect(overBudget?.autofixable).toBe(false);
    expect(overBudget?.workspace).toBe("gameframe-v2");
    expect(typeof overBudget?.estMonthlyUsd).toBe("number");
    expect(typeof overBudget?.title).toBe("string");
    expect(typeof overBudget?.detail).toBe("string");
    expect(typeof overBudget?.fix).toBe("string");

    // orphan finding assertions
    expect(orphan?.severity).toBe("warn");
    expect(orphan?.provider).toBe("github");
    expect(orphan?.autofixable).toBe(false);
    expect(orphan?.workspace).toBe("gameframe-v2");
    expect(typeof orphan?.estMonthlyUsd).toBe("number");
    expect(typeof orphan?.title).toBe("string");
    expect(typeof orphan?.detail).toBe("string");
    expect(typeof orphan?.fix).toBe("string");

    // all 9 fields present on each finding
    for (const f of findings) {
      expect(f).toHaveProperty("workspace");
      expect(f).toHaveProperty("provider");
      expect(f).toHaveProperty("rule");
      expect(f).toHaveProperty("severity");
      expect(f).toHaveProperty("estMonthlyUsd");
      expect(f).toHaveProperty("title");
      expect(f).toHaveProperty("detail");
      expect(f).toHaveProperty("fix");
      expect(f).toHaveProperty("autofixable");
    }
  });
});

describe("githubModule.check — clean case (budget high enough, no orphans)", () => {
  it("returns 0 findings when declared repo is under budget and no other repos", async () => {
    const cleanFixture = {
      usageItems: [
        {
          product: "Actions",
          quantity: 500,
          unitType: "minutes",
          netAmount: 0,
          repositoryName: "gameframe-v2",
        },
      ],
    };

    const cleanFetcher = makeFixtureFetcher({
      "/users/mbanderas/settings/billing/usage": cleanFixture,
    });

    const findings = await githubModule.check({
      ctx: BASE_CTX,
      entry: BASE_ENTRY,
      fetcher: cleanFetcher,
      config: DEFAULT_CONFIG,
    });

    expect(findings).toHaveLength(0);
  });
});

describe("githubModule.check — absent github active config", () => {
  it("returns [] when active.github is absent", async () => {
    const findings = await githubModule.check({
      ctx: BASE_CTX,
      entry: { providers: ["github"], active: {} },
      fetcher,
      config: DEFAULT_CONFIG,
    });
    expect(findings).toHaveLength(0);
  });
});
