import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { flyModule } from "../../src/providers/fly/index.js";

// Offline mocked-fetcher test of the full ProviderModule.check path: live app
// list (API) reconciled against operator-declared IPv4 + criticality.

const appsFixture = { apps: [{ name: "preview-pr-1" }, { name: "prod" }] };

function makeArgs(activeFly: unknown) {
  return {
    ctx: {
      workspace: "acme",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "acme"),
    },
    entry: { providers: ["fly"], active: { fly: activeFly } },
    fetcher: makeFixtureFetcher({ "/v1/apps": appsFixture }),
    config: DEFAULT_CONFIG,
  };
}

describe("flyModule", () => {
  it("is enabled when a FLY_API_TOKEN is present", () => {
    expect(flyModule.id).toBe("fly");
    expect(flyModule.isEnabled({ FLY_API_TOKEN: "tok" })).toBe(true);
    expect(flyModule.isEnabled({})).toBe(false);
  });

  it("flags the preview app's IPv4 but not the critical prod app", async () => {
    const findings = await flyModule.check(
      makeArgs({
        orgSlug: "acme-org",
        apps: [
          { name: "preview-pr-1", dedicatedIpv4Count: 1, critical: false },
          { name: "prod", dedicatedIpv4Count: 1, critical: true },
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("fly/orphaned-ipv4");
    expect(f.detail).toMatch(/preview-pr-1/);
    expect(f.estMonthlyUsd).toBeCloseTo(2, 5);
  });

  it("returns [] when the fly active entry is absent", async () => {
    const args = makeArgs({ orgSlug: "acme-org", apps: [] });
    const findings = await flyModule.check({
      ...args,
      entry: { providers: ["fly"], active: {} },
    });
    expect(findings).toHaveLength(0);
  });
});
