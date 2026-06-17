// Boundary validation schemas for the MCP surface. Inputs are validated with zod
// at the tool boundary (project rule: validate at system boundaries only — the
// engine functions stay validation-light internally). The `Finding` TS type is
// re-exported from the engine, not re-declared, so there is ONE source of truth.
import { z } from "zod";

export type { Finding } from "../types.js";
export type { Detection } from "../discovery/detect.js";
export type { EngineResult } from "../fix/types.js";

// ---------------------------------------------------------------------------
// Finding + envelope
// ---------------------------------------------------------------------------

export const severitySchema = z.enum(["info", "warn", "high"]);

export const findingSchema = z.object({
  workspace: z.string(),
  provider: z.string(),
  rule: z.string(),
  severity: severitySchema,
  estMonthlyUsd: z.number(),
  title: z.string(),
  detail: z.string(),
  fix: z.string(),
  autofixable: z.boolean(),
  kind: z.enum(["cost", "diagnostic"]).optional(),
});

/**
 * Shared output envelope so totals are computed once, consistently. `totalMonthlyUsd`
 * is the sum over COST findings only (the adapter filters `kind !== "diagnostic"`
 * before reusing the engine `totalMonthlyUsd` helper — never a re-implemented sum).
 */
export const findingsResultSchema = z.object({
  findings: z.array(findingSchema),
  totalMonthlyUsd: z.number(),
  countsBySeverity: z.object({
    info: z.number(),
    warn: z.number(),
    high: z.number(),
  }),
  diagnostics: z.number(),
});
export type FindingsResult = z.infer<typeof findingsResultSchema>;

// ---------------------------------------------------------------------------
// live bridge types (playwriter)
// ---------------------------------------------------------------------------

// Closed union: a billing reading is a currency figure, a number, or a label.
// `token`/`cookie`/secret-bearing kinds are rejected by construction.
export const parseSpecFieldSchema = z.object({
  name: z.string(),
  selectorHint: z.string(),
  kind: z.enum(["currency", "number", "label"]),
});

export const parseSpecSchema = z.object({
  fields: z.array(parseSpecFieldSchema),
  monthlyUsdField: z.string(),
});
export type ParseSpec = z.infer<typeof parseSpecSchema>;

export const liveCheckPlaybookSchema = z.object({
  planId: z.string(),
  provider: z.string(),
  apiFirst: z.boolean(),
  billingUrl: z.string().optional(),
  readOnlySnippet: z.string().optional(),
  parseSpec: parseSpecSchema.optional(),
  consentNotice: z.string(),
});
export type LiveCheckPlaybook = z.infer<typeof liveCheckPlaybookSchema>;

export const liveReadingSchema = z.object({
  planId: z.string(),
  values: z.record(z.string(), z.union([z.string(), z.number()])),
  raw: z.string().optional(),
});
export type LiveReading = z.infer<typeof liveReadingSchema>;

// ---------------------------------------------------------------------------
// tool input schemas
// ---------------------------------------------------------------------------

export const auditWorkspaceInputSchema = z.object({
  workspaces: z.array(z.string()).optional(),
  all: z.boolean().optional(),
  includeSite: z.boolean().optional(),
});
export type AuditWorkspaceInput = z.infer<typeof auditWorkspaceInputSchema>;

export const discoverProvidersInputSchema = z.object({
  dir: z.string(),
});
export type DiscoverProvidersInput = z.infer<typeof discoverProvidersInputSchema>;

export const auditSiteInputSchema = z.object({
  urls: z.array(z.string()),
});
export type AuditSiteInput = z.infer<typeof auditSiteInputSchema>;

export const planFixInputSchema = z.object({
  findings: z.array(findingSchema),
  workspaceDir: z.string(),
});
export type PlanFixInput = z.infer<typeof planFixInputSchema>;

// `confirmApply` is shape-optional; the apply_fix handler REFUSES unless it is
// strictly `true`, so the consent gate produces a structured domain error rather
// than a raw schema error.
export const applyFixInputSchema = z.object({
  findings: z.array(findingSchema),
  workspaceDir: z.string(),
  confirmApply: z.boolean().optional(),
});
export type ApplyFixInput = z.infer<typeof applyFixInputSchema>;

export const planLiveChecksInputSchema = z.object({
  provider: z.string(),
  workspaceDir: z.string().optional(),
  // Explicit per-run consent (gate 2). Without it the tool returns the consent
  // notice and the API-first decision but withholds the actionable browser snippet.
  confirmLive: z.boolean().optional(),
});
export type PlanLiveChecksInput = z.infer<typeof planLiveChecksInputSchema>;

export const ingestLiveReadingInputSchema = z.object({
  provider: z.string(),
  reading: liveReadingSchema,
});
export type IngestLiveReadingInput = z.infer<typeof ingestLiveReadingInputSchema>;
