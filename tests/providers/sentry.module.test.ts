import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { sentryModule } from "../../src/providers/sentry/index.js";

// Offline mocked-fetcher test of the full ProviderModule.check path:
// org stats -> normalized error events -> reconcile -> error-overage finding.

const statsFixture = {
  groups: [
    { totals: { "sum(quantity)": 90_000 } },
    { totals: { "sum(quantity)": 30_000 } },
  ],
};

function makeArgs(activeSentry: unknown) {
  return {
    ctx: {
      workspace: "acme",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "acme"),
    },
    entry: { providers: ["sentry"], active: { sentry: activeSentry } },
    fetcher: makeFixtureFetcher({ "/stats_v2": statsFixture }),
    config: DEFAULT_CONFIG,
  };
}

describe("sentryModule", () => {
  it("is enabled when a SENTRY_AUTH_TOKEN is present", () => {
    expect(sentryModule.id).toBe("sentry");
    expect(sentryModule.isEnabled({ SENTRY_AUTH_TOKEN: "tok" })).toBe(true);
    expect(sentryModule.isEnabled({})).toBe(false);
  });

  it("flags error-event overage via the mocked stats API", async () => {
    // total = 120000 events; team quota 50000; overage 70000 * 0.00036 = 25.2
    const findings = await sentryModule.check(makeArgs({ orgSlug: "acme-org", plan: "team" }));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("sentry/error-overage");
    expect(f.provider).toBe("sentry");
    expect(f.estMonthlyUsd).toBeCloseTo(25.2, 5);
    expect(f.severity).toBe("high");
  });

  it("returns [] when the sentry active entry is absent", async () => {
    const args = makeArgs({ orgSlug: "acme-org" });
    const findings = await sentryModule.check({
      ...args,
      entry: { providers: ["sentry"], active: {} },
    });
    expect(findings).toHaveLength(0);
  });
});
