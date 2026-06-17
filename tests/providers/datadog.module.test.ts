import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { datadogModule } from "../../src/providers/datadog/index.js";

// Datadog is declaration-only: the live host-count fetch needs dual-key auth
// (DD-API-KEY + DD-APPLICATION-KEY) the single-Bearer fetcher cannot supply, so
// check() reconciles operator-declared counts and makes no network call.

function makeArgs(activeDd: unknown) {
  return {
    ctx: {
      workspace: "acme",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "acme"),
    },
    entry: { providers: ["datadog"], active: { datadog: activeDd } },
    fetcher: makeFixtureFetcher({}), // never called
    config: DEFAULT_CONFIG,
  };
}

describe("datadogModule", () => {
  it("is enabled when a DD_API_KEY is present", () => {
    expect(datadogModule.id).toBe("datadog");
    expect(datadogModule.isEnabled({ DD_API_KEY: "tok" })).toBe(true);
    expect(datadogModule.isEnabled({})).toBe(false);
  });

  it("flags excess APM hosts from declared counts", async () => {
    const findings = await datadogModule.check(
      makeArgs({ plan: "pro", apmHostsActive: 50, apmHostsNeeded: 10 }),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("datadog/excess-apm-hosts");
    expect(f.estMonthlyUsd).toBeCloseTo(1240, 5);
    expect(f.severity).toBe("high");
  });

  it("returns [] when the datadog active entry is absent", async () => {
    const args = makeArgs({ plan: "pro", apmHostsActive: 1, apmHostsNeeded: 1 });
    const findings = await datadogModule.check({
      ...args,
      entry: { providers: ["datadog"], active: {} },
    });
    expect(findings).toHaveLength(0);
  });
});
