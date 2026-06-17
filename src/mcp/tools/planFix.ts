import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Finding } from "../../types.js";
import { runFixEngine } from "../../fix/engine.js";
import { planFixInputSchema } from "../schemas.js";

/**
 * plan_fix: wrap runFixEngine in dry-run mode (apply:false) — returns unified
 * diffs only and writes nothing. The findings are zod-validated at the boundary;
 * the cast reconciles zod's `kind?: T | undefined` optional inference with the
 * engine's exactOptional `kind?` (the schema mirrors Finding exactly).
 */
export function planFixHandler(args: unknown): CallToolResult {
  const { findings, workspaceDir } = planFixInputSchema.parse(args);
  const results = runFixEngine({
    findings: findings as readonly Finding[],
    workspaceDir,
    apply: false,
  });
  const payload = { results };
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
}
