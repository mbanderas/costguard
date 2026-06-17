import { describe, it, expect } from "vitest";
import {
  loadRunnerPricing,
  parseRunnerLabel,
  hostedRatePerMinute,
  baselineRatePerMinute,
} from "../src/checks/ci/runnerPricing.js";

describe("github-actions knowledge table", () => {
  it("loads sourced per-minute rates", () => {
    const p = loadRunnerPricing();
    expect(p.hostedPerMinute.linux?.["2"]).toBe(0.006);
    expect(p.hostedPerMinute.linux?.["32"]).toBe(0.082);
    expect(p.hostedPerMinute.windows?.["8"]).toBe(0.042);
    expect(p.selfHostedPlatformFeePerMinute).toBe(0.002);
  });

  it("ships a source URL for every fact group", () => {
    const p = loadRunnerPricing();
    expect(p.sources.length).toBeGreaterThan(0);
    for (const s of p.sources) {
      expect(s.url).toMatch(/^https:\/\//);
    }
  });
});

describe("parseRunnerLabel", () => {
  it("parses a larger-runner label into os + cores", () => {
    expect(parseRunnerLabel("ubuntu-latest-16-cores")).toEqual({ os: "linux", cores: 16 });
    expect(parseRunnerLabel("ubuntu-22.04-32-cores")).toEqual({ os: "linux", cores: 32 });
    expect(parseRunnerLabel("windows-latest-8-cores")).toEqual({ os: "windows", cores: 8 });
  });

  it("detects arm larger runners", () => {
    expect(parseRunnerLabel("ubuntu-latest-arm-4-cores")).toEqual({ os: "linux-arm", cores: 4 });
  });

  it("returns null for a standard runner with no core suffix", () => {
    expect(parseRunnerLabel("ubuntu-latest")).toBeNull();
    expect(parseRunnerLabel("self-hosted")).toBeNull();
    expect(parseRunnerLabel("unknown")).toBeNull();
  });
});

describe("rate lookups", () => {
  it("returns the hosted rate for a known os + core count", () => {
    expect(hostedRatePerMinute("linux", 32)).toBe(0.082);
    expect(hostedRatePerMinute("windows", 96)).toBe(0.552);
  });

  it("returns undefined for an unknown core count", () => {
    expect(hostedRatePerMinute("linux", 999)).toBeUndefined();
  });

  it("returns the right-sized baseline rate for an os", () => {
    expect(baselineRatePerMinute("linux")).toBe(0.006);
    expect(baselineRatePerMinute("macos")).toBe(0.062);
  });
});
