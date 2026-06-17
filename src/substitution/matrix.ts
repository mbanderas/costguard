import fs from "node:fs";
import { z } from "zod";
import { knowledgePath } from "../knowledge/paths.js";

// Sourced cross-tool substitution matrix (knowledge/substitutions.json). The
// reconcile pass reads equivalence classes + base pricing from here; every $
// number ships with its source URL in the JSON (never hardcoded, never fabricated).

const SourceSchema = z.object({ what: z.string(), url: z.string().url() });

const ToolSchema = z.object({
  provider: z.string(),
  plan: z.string(),
  baseMonthlyUsd: z.number().nonnegative(),
  migration: z.enum(["low", "medium", "high"]),
  lockIn: z.string(),
  source: SourceSchema,
});

export type SubstitutionTool = z.infer<typeof ToolSchema>;

const ClassSchema = z.object({
  id: z.string(),
  capability: z.string(),
  tools: z.array(ToolSchema).min(2),
});

export type SubstitutionClass = z.infer<typeof ClassSchema>;

const MatrixSchema = z.object({
  schemaVersion: z.number(),
  provider: z.literal("substitutions"),
  updated: z.string(),
  currency: z.string(),
  note: z.string().optional(),
  minMaterialSavingsUsd: z.number().nonnegative(),
  classes: z.array(ClassSchema).min(1),
  nonSubstitutes: z.array(z.object({ pair: z.string(), why: z.string() })).optional(),
  sources: z.array(SourceSchema).min(1),
});

export type SubstitutionMatrix = z.infer<typeof MatrixSchema>;

const FACT_PATH = knowledgePath("substitutions.json");

let cached: SubstitutionMatrix | undefined;

/** Load + validate the substitution matrix (cached). */
export function loadSubstitutions(): SubstitutionMatrix {
  if (cached !== undefined) return cached;
  const raw: unknown = JSON.parse(fs.readFileSync(FACT_PATH, "utf8"));
  cached = MatrixSchema.parse(raw);
  return cached;
}
