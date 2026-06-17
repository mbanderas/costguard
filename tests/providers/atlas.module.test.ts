import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { atlasModule } from "../../src/providers/atlas/index.js";

// Offline mocked-fetcher test of the full ProviderModule.check path: live
// cluster tiers (API) reconciled against operator-declared env + data size.

const clustersFixture = {
  results: [
    { name: "acme-staging", providerSettings: { instanceSizeName: "M10" } },
    { name: "acme-prod", providerSettings: { instanceSizeName: "M10" } },
  ],
};

function makeArgs(activeAtlas: unknown) {
  return {
    ctx: {
      workspace: "acme",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "acme"),
    },
    entry: { providers: ["atlas"], active: { atlas: activeAtlas } },
    fetcher: makeFixtureFetcher({ "/clusters": clustersFixture }),
    config: DEFAULT_CONFIG,
  };
}

describe("atlasModule", () => {
  it("is enabled when an ATLAS_API_KEY is present", () => {
    expect(atlasModule.id).toBe("atlas");
    expect(atlasModule.isEnabled({ ATLAS_API_KEY: "tok" })).toBe(true);
    expect(atlasModule.isEnabled({})).toBe(false);
  });

  it("flags the staging M10 but not the prod M10", async () => {
    const findings = await atlasModule.check(
      makeArgs({
        projectId: "p1",
        clusters: [
          { name: "acme-staging", env: "staging", dataSizeGb: 0.3 },
          { name: "acme-prod", env: "prod", dataSizeGb: 0.3 },
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("atlas/oversized-cluster");
    expect(f.detail).toMatch(/acme-staging/);
    expect(f.estMonthlyUsd).toBeCloseTo(48.6, 5);
  });

  it("returns [] when the atlas active entry is absent", async () => {
    const args = makeArgs({ projectId: "p1", clusters: [] });
    const findings = await atlasModule.check({
      ...args,
      entry: { providers: ["atlas"], active: {} },
    });
    expect(findings).toHaveLength(0);
  });
});
