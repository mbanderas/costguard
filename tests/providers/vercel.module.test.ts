import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, resolveWorkspaceConfig } from "../../src/config.js";
import { makeFixtureFetcher } from "../../src/providers/fetcher.js";
import { vercelModule } from "../../src/providers/vercel/index.js";

// Offline mocked-fetcher test of the full ProviderModule.check path: members
// + deployments -> normalized seats -> reconcile -> idle-seats finding.

const membersFixture = {
  members: [
    { uid: "u1", role: "OWNER" },
    { uid: "u2", role: "MEMBER" },
    { uid: "u3", role: "MEMBER" },
    { uid: "u4", role: "MEMBER" },
    { uid: "u5", role: "VIEWER" }, // not deploy-capable -> excluded
  ],
};

const deploymentsFixture = {
  deployments: [
    { uid: "d1", creator: { uid: "u1" } },
    { uid: "d2", creator: { uid: "u1" } },
    { uid: "d3", creator: { uid: "u2" } },
  ],
};

function makeArgs(activeVercel: unknown) {
  return {
    ctx: {
      workspace: "acme",
      workspaceDir: ".",
      config: resolveWorkspaceConfig(DEFAULT_CONFIG, "acme"),
    },
    entry: { providers: ["vercel"], active: { vercel: activeVercel } },
    fetcher: makeFixtureFetcher({
      "/members": membersFixture,
      "/deployments": deploymentsFixture,
    }),
    config: DEFAULT_CONFIG,
  };
}

describe("vercelModule", () => {
  it("is enabled when a VERCEL_TOKEN is present", () => {
    expect(vercelModule.id).toBe("vercel");
    expect(vercelModule.isEnabled({ VERCEL_TOKEN: "tok" })).toBe(true);
    expect(vercelModule.isEnabled({})).toBe(false);
  });

  it("flags idle paid seats via the mocked members + deployments API", async () => {
    // deploy-capable = u1..u4 (4 paid); active deployers among them = u1,u2 (2)
    // idle = 4 - max(2,1) = 2 seats; 2 * $20 = $40/mo
    const findings = await vercelModule.check(makeArgs({ teamId: "team_abc" }));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("vercel/idle-seats");
    expect(f.provider).toBe("vercel");
    expect(f.estMonthlyUsd).toBeCloseTo(40, 5);
    expect(f.severity).toBe("high");
  });

  it("returns [] when the vercel active entry is absent", async () => {
    const args = makeArgs({ teamId: "team_abc" });
    const findings = await vercelModule.check({
      ...args,
      entry: { providers: ["vercel"], active: {} },
    });
    expect(findings).toHaveLength(0);
  });
});
