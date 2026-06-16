import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkflow } from "../src/checks/ci/parser.js";
import {
  checkDoubleTrigger,
  checkNoPathsIgnore,
  checkNoConcurrency,
  checkNoTimeout,
  checkJobFanout,
  checkMatrixOverkill,
  checkScheduleFrequency,
} from "../src/checks/ci/rules.js";
import type { CheckContext } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

const defaultCtx: CheckContext = {
  workspace: "test-ws",
  workspaceDir: "/tmp/test",
  config: {
    cronThresholdMinutes: 15,
    ciMinuteRate: 0.008,
    assumedPushesPerDay: 10,
    assumedMinutesPerRun: 5,
  },
};

// ------------------------------------------------------------------
// (a) Clean fixture — no cost findings (allow actionlint-unavailable info)
// ------------------------------------------------------------------

describe("clean fixture", () => {
  const cleanPath = path.join(FIXTURES, "workflow-clean.yml");

  it("produces zero cost findings", () => {
    const model = parseWorkflow(cleanPath);
    const ctx = { ...defaultCtx };

    const findings = [
      ...checkDoubleTrigger(model, ctx),
      ...checkNoPathsIgnore(model, ctx),
      ...checkNoConcurrency(model, ctx),
      ...checkNoTimeout(model, ctx),
      ...checkJobFanout(model, ctx),
      ...checkMatrixOverkill(model, ctx),
      ...checkScheduleFrequency(model, ctx),
    ];

    const costFindings = findings.filter((f) => f.rule !== "ci/actionlint-unavailable");
    expect(costFindings).toHaveLength(0);
  });

  it("parses pull_request trigger with paths-ignore", () => {
    const model = parseWorkflow(cleanPath);
    expect(model.pull_request).toBeDefined();
    expect(model.pull_request?.["paths-ignore"]).toContain("**.md");
    expect(model.pull_request?.["paths-ignore"]).toContain("docs/**");
  });

  it("parses concurrency with cancel-in-progress true", () => {
    const model = parseWorkflow(cleanPath);
    expect(model.concurrency?.["cancel-in-progress"]).toBe(true);
  });

  it("all jobs have timeout-minutes", () => {
    const model = parseWorkflow(cleanPath);
    for (const [, job] of Object.entries(model.jobs)) {
      expect(job.timeoutMinutes).toBeDefined();
    }
  });

  it("no push trigger", () => {
    const model = parseWorkflow(cleanPath);
    expect(model.push).toBeUndefined();
  });

  it("no schedule trigger", () => {
    const model = parseWorkflow(cleanPath);
    expect(model.schedule).toBeUndefined();
  });
});

// ------------------------------------------------------------------
// (b) Wasteful fixture — all 7 rule ids present
// ------------------------------------------------------------------

describe("wasteful fixture", () => {
  const wastefulPath = path.join(FIXTURES, "workflow-wasteful.yml");

  it("triggers ci/double-trigger", () => {
    const model = parseWorkflow(wastefulPath);
    const findings = checkDoubleTrigger(model, defaultCtx);
    expect(findings.some((f) => f.rule === "ci/double-trigger")).toBe(true);
  });

  it("triggers ci/no-paths-ignore for push", () => {
    const model = parseWorkflow(wastefulPath);
    const findings = checkNoPathsIgnore(model, defaultCtx);
    expect(findings.some((f) => f.rule === "ci/no-paths-ignore")).toBe(true);
  });

  it("triggers ci/no-concurrency", () => {
    const model = parseWorkflow(wastefulPath);
    const findings = checkNoConcurrency(model, defaultCtx);
    expect(findings.some((f) => f.rule === "ci/no-concurrency")).toBe(true);
  });

  it("triggers ci/no-timeout for multiple jobs", () => {
    const model = parseWorkflow(wastefulPath);
    const findings = checkNoTimeout(model, defaultCtx);
    expect(findings.some((f) => f.rule === "ci/no-timeout")).toBe(true);
  });

  it("triggers ci/job-fanout", () => {
    const model = parseWorkflow(wastefulPath);
    const findings = checkJobFanout(model, defaultCtx);
    expect(findings.some((f) => f.rule === "ci/job-fanout")).toBe(true);
  });

  it("triggers ci/matrix-overkill", () => {
    const model = parseWorkflow(wastefulPath);
    const findings = checkMatrixOverkill(model, defaultCtx);
    expect(findings.some((f) => f.rule === "ci/matrix-overkill")).toBe(true);
  });

  it("triggers ci/schedule-frequency", () => {
    const model = parseWorkflow(wastefulPath);
    const findings = checkScheduleFrequency(model, defaultCtx);
    expect(findings.some((f) => f.rule === "ci/schedule-frequency")).toBe(true);
  });
});

// ------------------------------------------------------------------
// (c) Unit tests for individual rule fns — precise $ and severity
// ------------------------------------------------------------------

describe("checkDoubleTrigger — dollar calculation", () => {
  it("computes estMonthlyUsd correctly", () => {
    const model = parseWorkflow(path.join(FIXTURES, "workflow-wasteful.yml"));
    const findings = checkDoubleTrigger(model, defaultCtx);
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    // runsPerMonth = 10 * 30 = 300; $ = 5 * 300 * 0.008 = 12
    expect(f.estMonthlyUsd).toBeCloseTo(12, 5);
    expect(f.severity).toBe("high");
    expect(f.autofixable).toBe(true);
  });
});

describe("checkNoPathsIgnore — dollar is zero", () => {
  it("returns estMonthlyUsd=0", () => {
    const model = parseWorkflow(path.join(FIXTURES, "workflow-wasteful.yml"));
    const findings = checkNoPathsIgnore(model, defaultCtx);
    for (const f of findings) {
      expect(f.estMonthlyUsd).toBe(0);
    }
  });
});

describe("checkNoConcurrency — dollar is zero", () => {
  it("returns estMonthlyUsd=0 and warn severity", () => {
    const model = parseWorkflow(path.join(FIXTURES, "workflow-wasteful.yml"));
    const findings = checkNoConcurrency(model, defaultCtx);
    expect(findings[0]?.estMonthlyUsd).toBe(0);
    expect(findings[0]?.severity).toBe("warn");
  });
});

describe("checkNoTimeout — dollar is zero", () => {
  it("flags all jobs without timeouts", () => {
    const model = parseWorkflow(path.join(FIXTURES, "workflow-wasteful.yml"));
    const findings = checkNoTimeout(model, defaultCtx);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.estMonthlyUsd).toBe(0);
      expect(f.rule).toBe("ci/no-timeout");
    }
  });
});

describe("checkJobFanout — dollar calculation", () => {
  it("computes estMonthlyUsd for redundant jobs", () => {
    const model = parseWorkflow(path.join(FIXTURES, "workflow-wasteful.yml"));
    const findings = checkJobFanout(model, defaultCtx);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      // (matchingJobCount - 1) * assumedMinutesPerRun * runsPerMonth * ciMinuteRate
      // must be > 0
      expect(f.estMonthlyUsd).toBeGreaterThan(0);
      expect(f.rule).toBe("ci/job-fanout");
    }
  });
});

describe("checkMatrixOverkill — combination count", () => {
  it("reports 6-combination matrix", () => {
    const model = parseWorkflow(path.join(FIXTURES, "workflow-wasteful.yml"));
    const findings = checkMatrixOverkill(model, defaultCtx);
    expect(findings.length).toBeGreaterThan(0);
    const f = findings[0]!;
    expect(f.title).toMatch(/6/); // 3 nodes x 2 os = 6
    expect(f.estMonthlyUsd).toBe(0);
  });
});

describe("checkScheduleFrequency — exact cost and severity", () => {
  it("computes cost for */5 cron (288 runs/day)", () => {
    const model = parseWorkflow(path.join(FIXTURES, "workflow-wasteful.yml"));
    const findings = checkScheduleFrequency(model, defaultCtx);
    expect(findings.length).toBe(1);
    const f = findings[0]!;
    // 288 runs/day * 30 = 8640 runs/month; 5 * 8640 * 0.008 = 345.6
    expect(f.estMonthlyUsd).toBeCloseTo(345.6, 0);
    // interval = 5min < threshold 15min => high
    expect(f.severity).toBe("high");
  });

  it("warns (not high) for a daily cron beyond threshold", () => {
    const model: import("../src/checks/ci/parser.js").WorkflowModel = {
      filePath: "fake.yml",
      workflow_call: false,
      workflow_dispatch: false,
      schedule: [{ cron: "0 0 * * *" }], // daily — 1 run/day
      jobs: {},
    };
    const findings = checkScheduleFrequency(model, defaultCtx);
    // only 1 run/day — not >1, so no finding
    expect(findings).toHaveLength(0);
  });

  it("produces warn for twice-daily cron (above threshold interval)", () => {
    const model: import("../src/checks/ci/parser.js").WorkflowModel = {
      filePath: "fake.yml",
      workflow_call: false,
      workflow_dispatch: false,
      schedule: [{ cron: "0 */12 * * *" }], // twice daily, 720min interval
      jobs: {},
    };
    const findings = checkScheduleFrequency(model, defaultCtx);
    // 2 runs/day > 1 => finding; 720min interval >> 15min threshold => warn not high
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warn");
  });
});

// ------------------------------------------------------------------
// (d) actionlint-unavailable path
// ------------------------------------------------------------------

describe("runActionlint — unavailable", () => {
  it("returns ci/actionlint-unavailable info finding when not on PATH", async () => {
    // Mock execFile to simulate ENOENT
    vi.mock("node:child_process", () => ({
      execFile: (
        cmd: string,
        _args: string[],
        callback: (err: NodeJS.ErrnoException | null) => void,
      ) => {
        if (cmd === "actionlint") {
          const err = new Error("spawn actionlint ENOENT") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          callback(err);
        }
        return {} as unknown;
      },
    }));

    // Import after mocking — use dynamic import to pick up mock
    const { runActionlint: mockedRun } = await import("../src/checks/ci/actionlint.js");
    const findings = await mockedRun("/tmp/fake-workspace", "test-ws");
    const unavailable = findings.find((f) => f.rule === "ci/actionlint-unavailable");
    expect(unavailable).toBeDefined();
    expect(unavailable?.severity).toBe("info");
    expect(unavailable?.estMonthlyUsd).toBe(0);
    expect(unavailable?.autofixable).toBe(false);
  });
});
