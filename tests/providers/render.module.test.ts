import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { renderModule } from "../../src/providers/render/index.js";

// Offline mocked-fetcher test of the full ProviderModule.check path: live
// service plans (API) reconciled against operator-declared env.

const servicesFixture = [
  { service: { name: "api-staging", serviceDetails: { plan: "pro" } } },
  { service: { name: "api-prod", serviceDetails: { plan: "pro" } } },
];

function makeArgs(activeRender: unknown) {
  return {
    ctx: {
      workspace: "acme",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "acme"),
    },
    entry: { providers: ["render"], active: { render: activeRender } },
    fetcher: makeFixtureFetcher({ "/v1/services": servicesFixture }),
    config: DEFAULT_CONFIG,
  };
}

describe("renderModule", () => {
  it("is enabled when a RENDER_API_KEY is present", () => {
    expect(renderModule.id).toBe("render");
    expect(renderModule.isEnabled({ RENDER_API_KEY: "tok" })).toBe(true);
    expect(renderModule.isEnabled({})).toBe(false);
  });

  it("flags the staging Pro service but not the prod one", async () => {
    const findings = await renderModule.check(
      makeArgs({
        services: [
          { name: "api-staging", env: "staging" },
          { name: "api-prod", env: "prod" },
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("render/oversized-instance");
    expect(f.detail).toMatch(/api-staging/);
    expect(f.estMonthlyUsd).toBeCloseTo(60, 5);
  });

  it("returns [] when the render active entry is absent", async () => {
    const args = makeArgs({ services: [] });
    const findings = await renderModule.check({
      ...args,
      entry: { providers: ["render"], active: {} },
    });
    expect(findings).toHaveLength(0);
  });
});
