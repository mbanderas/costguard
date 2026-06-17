import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { cloudflareModule } from "../../src/providers/cloudflare/index.js";

// Offline mocked-fetcher test of the full ProviderModule.check path: confirm
// R2 buckets exist (live GET) then reconcile operator-declared R2 usage.

const bucketsFixture = { result: { buckets: [{ name: "logs" }] } };

function makeArgs(activeCf: unknown) {
  return {
    ctx: {
      workspace: "acme",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "acme"),
    },
    entry: { providers: ["cloudflare"], active: { cloudflare: activeCf } },
    fetcher: makeFixtureFetcher({ "/r2/buckets": bucketsFixture }),
    config: DEFAULT_CONFIG,
  };
}

describe("cloudflareModule", () => {
  it("is enabled when a CLOUDFLARE_API_TOKEN is present", () => {
    expect(cloudflareModule.id).toBe("cloudflare");
    expect(cloudflareModule.isEnabled({ CLOUDFLARE_API_TOKEN: "tok" })).toBe(true);
    expect(cloudflareModule.isEnabled({})).toBe(false);
  });

  it("flags R2 op-heavy usage when buckets exist", async () => {
    const findings = await cloudflareModule.check(
      makeArgs({ accountId: "acc1", r2: { storageGb: 20, classAOps: 50_000_000, classBOps: 100_000_000 } }),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("cloudflare/r2-op-heavy");
    expect(f.estMonthlyUsd).toBeCloseTo(252.9, 4);
    expect(f.severity).toBe("high");
  });

  it("returns [] when the cloudflare active entry is absent", async () => {
    const args = makeArgs({ accountId: "acc1", r2: { storageGb: 1, classAOps: 0, classBOps: 0 } });
    const findings = await cloudflareModule.check({
      ...args,
      entry: { providers: ["cloudflare"], active: {} },
    });
    expect(findings).toHaveLength(0);
  });
});
