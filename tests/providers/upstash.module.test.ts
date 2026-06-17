import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { upstashModule } from "../../src/providers/upstash/index.js";

// Offline mocked-fetcher test of the full ProviderModule.check path:
// db stats -> normalized usage -> reconcile -> payg-vs-fixed finding.

const statsFixture = {
  command_count: 200_000_000,
  db_size: 500_000_000, // bytes -> 0.5 GB
};

function makeArgs(activeUpstash: unknown) {
  return {
    ctx: {
      workspace: "acme",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "acme"),
    },
    entry: { providers: ["upstash"], active: { upstash: activeUpstash } },
    fetcher: makeFixtureFetcher({ "/v2/redis/stats": statsFixture }),
    config: DEFAULT_CONFIG,
  };
}

describe("upstashModule", () => {
  it("is enabled when an UPSTASH_API_KEY is present", () => {
    expect(upstashModule.id).toBe("upstash");
    expect(upstashModule.isEnabled({ UPSTASH_API_KEY: "tok" })).toBe(true);
    expect(upstashModule.isEnabled({})).toBe(false);
  });

  it("flags payg-vs-fixed via the mocked stats API", async () => {
    const findings = await upstashModule.check(makeArgs({ databaseId: "db1", plan: "payg" }));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("upstash/payg-vs-fixed");
    expect(f.provider).toBe("upstash");
    // 200M commands -> $400 payg; 1gb fixed $20 -> waste 380
    expect(f.estMonthlyUsd).toBeCloseTo(380, 5);
    expect(f.severity).toBe("high");
  });

  it("returns [] when the upstash active entry is absent", async () => {
    const args = makeArgs({ databaseId: "db1", plan: "payg" });
    const findings = await upstashModule.check({
      ...args,
      entry: { providers: ["upstash"], active: {} },
    });
    expect(findings).toHaveLength(0);
  });
});
