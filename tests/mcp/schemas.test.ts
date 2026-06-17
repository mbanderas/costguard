import { describe, it, expect } from "vitest";
import {
  findingSchema,
  findingsResultSchema,
  parseSpecSchema,
  liveCheckPlaybookSchema,
  liveReadingSchema,
  auditWorkspaceInputSchema,
  discoverProvidersInputSchema,
  auditSiteInputSchema,
  planFixInputSchema,
  applyFixInputSchema,
  planLiveChecksInputSchema,
  ingestLiveReadingInputSchema,
} from "../../src/mcp/schemas.js";

const validFinding = {
  workspace: "ws",
  provider: "ci",
  rule: "ci/no-timeout",
  severity: "warn" as const,
  estMonthlyUsd: 12.5,
  title: "t",
  detail: "d",
  fix: "f",
  autofixable: true,
};

// ---------------------------------------------------------------------------
// findingSchema
// ---------------------------------------------------------------------------

describe("findingSchema", () => {
  it("round-trips a valid cost finding (no kind)", () => {
    const parsed = findingSchema.parse(validFinding);
    expect(parsed).toEqual(validFinding);
  });

  it("accepts an explicit diagnostic finding", () => {
    const diag = { ...validFinding, kind: "diagnostic" as const };
    expect(findingSchema.parse(diag).kind).toBe("diagnostic");
  });

  it("rejects an out-of-union severity", () => {
    expect(() => findingSchema.parse({ ...validFinding, severity: "critical" })).toThrow();
  });

  it("rejects a non-numeric estMonthlyUsd", () => {
    expect(() => findingSchema.parse({ ...validFinding, estMonthlyUsd: "12" })).toThrow();
  });

  it("rejects an out-of-union kind", () => {
    expect(() => findingSchema.parse({ ...validFinding, kind: "warning" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// findingsResultSchema (envelope)
// ---------------------------------------------------------------------------

describe("findingsResultSchema", () => {
  it("accepts a well-formed envelope", () => {
    const env = {
      findings: [validFinding],
      totalMonthlyUsd: 12.5,
      countsBySeverity: { info: 0, warn: 1, high: 0 },
      diagnostics: 0,
    };
    expect(findingsResultSchema.parse(env)).toEqual(env);
  });

  it("rejects an envelope containing a malformed finding", () => {
    const env = {
      findings: [{ ...validFinding, severity: "nope" }],
      totalMonthlyUsd: 0,
      countsBySeverity: { info: 0, warn: 0, high: 0 },
      diagnostics: 0,
    };
    expect(() => findingsResultSchema.parse(env)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ParseSpec — closed kind union rejects secret/token fields by construction
// ---------------------------------------------------------------------------

describe("parseSpecSchema", () => {
  it("accepts currency|number|label fields", () => {
    const spec = {
      fields: [
        { name: "total", selectorHint: ".total", kind: "currency" as const },
        { name: "count", selectorHint: ".count", kind: "number" as const },
        { name: "plan", selectorHint: ".plan", kind: "label" as const },
      ],
      monthlyUsdField: "total",
    };
    expect(parseSpecSchema.parse(spec).fields).toHaveLength(3);
  });

  it("rejects a field whose kind is outside the union (e.g. token)", () => {
    const spec = {
      fields: [{ name: "apiKey", selectorHint: ".key", kind: "token" }],
      monthlyUsdField: "apiKey",
    };
    expect(() => parseSpecSchema.parse(spec)).toThrow();
  });

  it("rejects a cookie kind", () => {
    const spec = {
      fields: [{ name: "c", selectorHint: ".c", kind: "cookie" }],
      monthlyUsdField: "c",
    };
    expect(() => parseSpecSchema.parse(spec)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// live bridge types
// ---------------------------------------------------------------------------

describe("liveCheckPlaybookSchema", () => {
  it("accepts an apiFirst playbook with no browser fields", () => {
    const pb = {
      planId: "p1",
      provider: "github",
      apiFirst: true,
      consentNotice: "notice",
    };
    expect(liveCheckPlaybookSchema.parse(pb).apiFirst).toBe(true);
  });

  it("accepts a browser-fallback playbook with snippet + parseSpec", () => {
    const pb = {
      planId: "p2",
      provider: "vercel",
      apiFirst: false,
      billingUrl: "https://vercel.com/account/billing",
      readOnlySnippet: "await page.goto(url);",
      parseSpec: { fields: [{ name: "t", selectorHint: ".t", kind: "currency" as const }], monthlyUsdField: "t" },
      consentNotice: "notice",
    };
    expect(liveCheckPlaybookSchema.parse(pb).readOnlySnippet).toContain("page.goto");
  });
});

describe("liveReadingSchema", () => {
  it("accepts string and number values", () => {
    const r = { planId: "p1", values: { total: "$12.50", count: 3 }, raw: "freeform" };
    expect(liveReadingSchema.parse(r).values.count).toBe(3);
  });

  it("rejects a non-record values field", () => {
    expect(() => liveReadingSchema.parse({ planId: "p1", values: "x" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// tool input schemas
// ---------------------------------------------------------------------------

describe("tool input schemas", () => {
  it("auditWorkspaceInputSchema accepts an empty object and a full object", () => {
    expect(auditWorkspaceInputSchema.parse({})).toEqual({});
    const full = { workspaces: ["a"], all: false, includeSite: true };
    expect(auditWorkspaceInputSchema.parse(full)).toEqual(full);
  });

  it("discoverProvidersInputSchema requires dir", () => {
    expect(discoverProvidersInputSchema.parse({ dir: "/tmp/x" }).dir).toBe("/tmp/x");
    expect(() => discoverProvidersInputSchema.parse({})).toThrow();
  });

  it("auditSiteInputSchema requires a urls array", () => {
    expect(auditSiteInputSchema.parse({ urls: ["https://x"] }).urls).toHaveLength(1);
    expect(() => auditSiteInputSchema.parse({})).toThrow();
  });

  it("planFixInputSchema requires findings + workspaceDir", () => {
    const ok = { findings: [validFinding], workspaceDir: "/ws" };
    expect(planFixInputSchema.parse(ok).workspaceDir).toBe("/ws");
    expect(() => planFixInputSchema.parse({ findings: [validFinding] })).toThrow();
  });

  it("applyFixInputSchema parses findings + workspaceDir and optional confirmApply", () => {
    const ok = { findings: [validFinding], workspaceDir: "/ws", confirmApply: true };
    expect(applyFixInputSchema.parse(ok).confirmApply).toBe(true);
    // confirmApply omitted is shape-valid (handler enforces the consent gate).
    expect(applyFixInputSchema.parse({ findings: [validFinding], workspaceDir: "/ws" }).confirmApply).toBeUndefined();
  });

  it("planLiveChecksInputSchema requires provider, workspaceDir optional", () => {
    expect(planLiveChecksInputSchema.parse({ provider: "vercel" }).provider).toBe("vercel");
    expect(() => planLiveChecksInputSchema.parse({})).toThrow();
  });

  it("ingestLiveReadingInputSchema requires provider + reading", () => {
    const ok = { provider: "vercel", reading: { planId: "p", values: {} } };
    expect(ingestLiveReadingInputSchema.parse(ok).provider).toBe("vercel");
    expect(() => ingestLiveReadingInputSchema.parse({ provider: "vercel" })).toThrow();
  });
});
