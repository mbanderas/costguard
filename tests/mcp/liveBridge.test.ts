import { describe, it, expect } from "vitest";
import { decideLiveStrategy } from "../../src/mcp/live/decide.js";
import { CONSENT_NOTICE, liveConsentGranted } from "../../src/mcp/live/consent.js";
import { playbookFor } from "../../src/mcp/live/playbooks/index.js";
import { planLiveChecksHandler } from "../../src/mcp/tools/planLiveChecks.js";
import { ingestLiveReadingHandler } from "../../src/mcp/tools/ingestLiveReading.js";
import type { LiveCheckPlaybook } from "../../src/mcp/schemas.js";
import type { Finding } from "../../src/types.js";
import { readOnlyViolations } from "./readOnlyOracle.js";

// ---------------------------------------------------------------------------
// decideLiveStrategy — deterministic env-NAME check, no network probe
// ---------------------------------------------------------------------------

describe("decideLiveStrategy", () => {
  it("API-first when a provider module exists and its token resolves from env", () => {
    expect(decideLiveStrategy("github", { GITHUB_TOKEN: "ghp_test" }).apiFirst).toBe(true);
  });

  it("browser-fallback when a known provider has no resolvable token", () => {
    expect(decideLiveStrategy("github", {}).apiFirst).toBe(false);
  });

  it("browser-fallback for an unknown provider (no module)", () => {
    expect(decideLiveStrategy("not-a-provider", { ANYTHING: "x" }).apiFirst).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// consent
// ---------------------------------------------------------------------------

describe("live consent", () => {
  it("grants only on explicit true", () => {
    expect(liveConsentGranted(true)).toBe(true);
    expect(liveConsentGranted(false)).toBe(false);
    expect(liveConsentGranted(undefined)).toBe(false);
  });

  it("consent notice states the read-only, no-credential posture", () => {
    expect(CONSENT_NOTICE).toMatch(/read-only/i);
    expect(CONSENT_NOTICE).toMatch(/playwriter/i);
  });
});

// ---------------------------------------------------------------------------
// playbook lookup (empty at P4 — populated by P5)
// ---------------------------------------------------------------------------

describe("playbookFor", () => {
  it("returns undefined (never throws) for an unknown provider", () => {
    expect(playbookFor("definitely-unknown")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// read-only invariant oracle (load-bearing — do NOT weaken this list to pass)
// ---------------------------------------------------------------------------

describe("readOnlyViolations oracle", () => {
  it("passes a read-only navigation snippet", () => {
    const snippet = "await page.goto(url); const t = await page.locator('.total').innerText();";
    expect(readOnlyViolations(snippet)).toEqual([]);
  });

  it("flags every forbidden mutation/secret token", () => {
    expect(readOnlyViolations("await page.fill('#x','y')")).toContain(".fill(");
    expect(readOnlyViolations("await page.click('#go')")).toContain(".click(");
    expect(readOnlyViolations("await page.type('#x','y')")).toContain(".type(");
    expect(readOnlyViolations("form.submit()")).toContain("submit");
    expect(readOnlyViolations("document.cookie")).toContain("cookie");
    expect(readOnlyViolations("window.localStorage.getItem('t')")).toContain("localStorage");
    expect(readOnlyViolations("window.sessionStorage")).toContain("sessionStorage");
    expect(readOnlyViolations("await page.screenshot()")).toContain("screenshot");
  });
});

// ---------------------------------------------------------------------------
// plan_live_checks handler
// ---------------------------------------------------------------------------

describe("plan_live_checks handler", () => {
  function playbook(res: { structuredContent?: unknown }): LiveCheckPlaybook {
    return res.structuredContent as LiveCheckPlaybook;
  }

  it("API-first provider (token in env): apiFirst true, consent notice, NO snippet", () => {
    process.env["GH_TOKEN"] = "ghp_test_token";
    try {
      const pb = playbook(planLiveChecksHandler({ provider: "github", confirmLive: true }));
      expect(pb.apiFirst).toBe(true);
      expect(pb.consentNotice).toMatch(/read-only/i);
      expect(pb.readOnlySnippet).toBeUndefined();
    } finally {
      delete process.env["GH_TOKEN"];
    }
  });

  it("without consent: returns notice + decision but withholds the snippet", () => {
    const pb = playbook(planLiveChecksHandler({ provider: "some-dashboard-only" }));
    expect(pb.consentNotice).toMatch(/read-only/i);
    expect(pb.readOnlySnippet).toBeUndefined();
    expect(pb.billingUrl).toBeUndefined();
  });

  it("browser-fallback with consent but no playbook yet: still no snippet (P5 adds data)", () => {
    const pb = playbook(planLiveChecksHandler({ provider: "some-dashboard-only", confirmLive: true }));
    expect(pb.apiFirst).toBe(false);
    expect(pb.readOnlySnippet).toBeUndefined();
  });

  it("any emitted snippet passes the read-only oracle (no playbook now -> vacuously true)", () => {
    const pb = playbook(planLiveChecksHandler({ provider: "some-dashboard-only", confirmLive: true }));
    if (pb.readOnlySnippet !== undefined) {
      expect(readOnlyViolations(pb.readOnlySnippet)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// ingest_live_reading handler
// ---------------------------------------------------------------------------

describe("ingest_live_reading handler", () => {
  function finding(res: { structuredContent?: unknown }): Finding {
    return (res.structuredContent as { finding: Finding }).finding;
  }

  it("parses a monthly figure from a named key into a cost Finding (no-playbook provider)", () => {
    // neon has no playbook -> ingest falls back to the named-key set.
    const f = finding(
      ingestLiveReadingHandler({ provider: "neon", reading: { planId: "p", values: { total: "$42.50" } } }),
    );
    expect(f.kind).toBe("cost");
    expect(f.estMonthlyUsd).toBeCloseTo(42.5, 5);
    expect(f.severity).toBe("warn");
  });

  it("unparseable reading -> diagnostic Finding with estMonthlyUsd 0 (never fabricates)", () => {
    const f = finding(
      ingestLiveReadingHandler({ provider: "neon", reading: { planId: "p", values: { note: "no number here" }, raw: "n/a" } }),
    );
    expect(f.kind).toBe("diagnostic");
    expect(f.estMonthlyUsd).toBe(0);
  });

  it("rejects input missing reading", () => {
    expect(() => ingestLiveReadingHandler({ provider: "vercel" })).toThrow();
  });
});
