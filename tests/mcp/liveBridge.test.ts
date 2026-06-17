import { describe, it, expect } from "vitest";
import { decideLiveStrategy } from "../../src/mcp/live/decide.js";
import { CONSENT_NOTICE, liveConsentGranted } from "../../src/mcp/live/consent.js";
import { playbookFor } from "../../src/mcp/live/playbooks/index.js";
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
