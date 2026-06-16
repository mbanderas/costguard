import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { reconcileRailway } from "../../src/providers/railway/reconcile.js";
import { runRailwayCheck } from "../../src/providers/railway/index.js";
import { makeFixtureGraphqlClient } from "../../src/providers/fetcher.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import { Q_PROJECTS, Q_SERVICES, Q_USAGE } from "../../src/providers/railway/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "../fixtures/railway");

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

// Fixed "now" so idle-day assertions are deterministic
const NOW = new Date("2026-06-16T00:00:00.000Z");
const RECENT = "2026-06-15T10:00:00.000Z";  // 1 day ago — not idle
const OLD    = "2026-01-01T00:00:00.000Z";  // ~166 days ago — idle

const BASE_SERVICES = [
  { id: "svc-backend", name: "backend", updatedAt: RECENT },
  { id: "svc-ghost",   name: "ghost",   updatedAt: OLD },
];

const BASE_DEPLOYMENTS = [
  { id: "deploy-1", status: "CRASHED", createdAt: "2026-06-10T08:00:00.000Z" },
];

describe("reconcileRailway — direct", () => {
  it("detects orphaned-service, idle-service, and lingering-deploy", () => {
    const findings = reconcileRailway({
      projectName: "web-app",
      services: BASE_SERVICES,
      deployments: BASE_DEPLOYMENTS,
      estimatedUsage: 12,
      active: { services: ["backend"] },
      config: DEFAULT_CONFIG,
      workspace: "myws",
      now: NOW,
    });

    // All 9 Finding fields present and provider = "railway"
    for (const f of findings) {
      expect(f.workspace).toBe("myws");
      expect(f.provider).toBe("railway");
      expect(typeof f.rule).toBe("string");
      expect(["info", "warn", "high"]).toContain(f.severity);
      expect(typeof f.estMonthlyUsd).toBe("number");
      expect(typeof f.title).toBe("string");
      expect(typeof f.detail).toBe("string");
      expect(typeof f.fix).toBe("string");
      expect(typeof f.autofixable).toBe("boolean");
      expect(f.autofixable).toBe(false);
    }

    const rules = findings.map((f) => f.rule);
    expect(rules).toContain("railway/orphaned-service");
    expect(rules).toContain("railway/idle-service");
    expect(rules).toContain("railway/lingering-deploy");

    const orphan = findings.find((f) => f.rule === "railway/orphaned-service");
    expect(orphan?.severity).toBe("high");
    expect(orphan?.title).toContain("ghost");

    const idle = findings.find((f) => f.rule === "railway/idle-service");
    expect(idle?.severity).toBe("warn");

    const linger = findings.find((f) => f.rule === "railway/lingering-deploy");
    expect(linger?.severity).toBe("info");
    expect(linger?.estMonthlyUsd).toBe(0);
  });

  it("returns 0 findings for clean state", () => {
    const findings = reconcileRailway({
      projectName: "web-app",
      services: [{ id: "svc-backend", name: "backend", updatedAt: RECENT }],
      deployments: [{ id: "d1", status: "SUCCESS", createdAt: RECENT }],
      estimatedUsage: 10,
      active: { services: ["backend"] },
      config: DEFAULT_CONFIG,
      workspace: "myws",
      now: NOW,
    });

    expect(findings).toHaveLength(0);
  });
});

describe("runRailwayCheck — fixture client (no network)", () => {
  it("returns >=1 finding using fixture data", async () => {
    const projectsData = loadFixture("projects.json");
    const servicesData = loadFixture("services.json");
    const usageData    = loadFixture("usage.json");

    const client = makeFixtureGraphqlClient({
      CostguardProjects: projectsData,
      CostguardServices: servicesData,
      CostguardUsage:    usageData,
    });

    const findings = await runRailwayCheck(
      {
        ctx: {
          workspace: "myws",
          workspaceDir: "/fake",
          config: {
            cronThresholdMinutes: 15,
            ciMinuteRate: 0.008,
            assumedPushesPerDay: 10,
            assumedMinutesPerRun: 5,
          },
        },
        entry: {
          providers: ["railway"],
          active: { railway: { services: ["backend"] } },
        },
        fetcher: async () => ({ ok: true, status: 200, json: async () => ({}) }),
        config: DEFAULT_CONFIG,
      },
      client,
    );

    expect(findings.length).toBeGreaterThanOrEqual(1);
    for (const f of findings) {
      expect(f.provider).toBe("railway");
    }
  });

  it("returns [] when active.railway is absent", async () => {
    const client = makeFixtureGraphqlClient({});
    const findings = await runRailwayCheck(
      {
        ctx: {
          workspace: "myws",
          workspaceDir: "/fake",
          config: {
            cronThresholdMinutes: 15,
            ciMinuteRate: 0.008,
            assumedPushesPerDay: 10,
            assumedMinutesPerRun: 5,
          },
        },
        entry: { providers: ["railway"], active: {} },
        fetcher: async () => ({ ok: true, status: 200, json: async () => ({}) }),
        config: DEFAULT_CONFIG,
      },
      client,
    );

    expect(findings).toHaveLength(0);
  });
});

describe("mutation safety", () => {
  it("Q_* constants contain no mutation keyword", () => {
    expect(/\bmutation\b/i.test(Q_PROJECTS + Q_SERVICES + Q_USAGE)).toBe(false);
  });
});
