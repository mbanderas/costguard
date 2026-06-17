import { describe, it, expect } from "vitest";
import { substitutionFindings } from "../../src/substitution/reconcile.js";

// ---------------------------------------------------------------------------
// Phase D cross-tool substitution. Suggest a cheaper, capability-equal tool only
// when a sourced alternative is materially cheaper. Every $ delta traces to a
// knowledge fact (URL in the detail) — never fabricated (R11). Tools that are
// NOT 1:1 stay in separate classes and are never cross-recommended (R13).
// ---------------------------------------------------------------------------

describe("substitutionFindings", () => {
  it("flags Vercel Pro -> Cloudflare Pages with a sourced saving (flagship)", () => {
    const findings = substitutionFindings("ws", ["vercel"]);
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.rule).toBe("vercel/cheaper-alternative");
    expect(f.provider).toBe("vercel");
    expect(f.estMonthlyUsd).toBe(20);
    expect(f.detail.toLowerCase()).toContain("cloudflare");
    // $ delta must be sourced — a URL appears in the finding (never fabricated)
    expect(f.detail).toMatch(/https?:\/\//);
    // migration + lock-in caveat present
    expect(f.detail.toLowerCase()).toContain("migration");
    expect(f.detail.toLowerCase()).toContain("lock-in");
  });

  it("flags Netlify Pro -> Cloudflare Pages too", () => {
    const findings = substitutionFindings("ws", ["netlify"]);
    expect(findings.map((x) => x.rule)).toContain("netlify/cheaper-alternative");
  });

  it("emits nothing when the workspace already uses the cheapest in-class tool", () => {
    expect(substitutionFindings("ws", ["cloudflare"])).toEqual([]);
  });

  it("emits nothing for a provider in no substitution class", () => {
    expect(substitutionFindings("ws", ["github"])).toEqual([]);
  });

  it("labels findings with the workspace and never marks them autofixable", () => {
    const findings = substitutionFindings("my-app", ["vercel"]);
    expect(findings.every((f) => f.workspace === "my-app")).toBe(true);
    expect(findings.every((f) => f.autofixable === false)).toBe(true);
  });
});
