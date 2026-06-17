import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Finding } from "../../types.js";
import { runFixEngine } from "../../fix/engine.js";
import { applyFixInputSchema } from "../schemas.js";

/**
 * apply_fix: wrap runFixEngine in apply mode (writes local CI-workflow files).
 * Consent gate: REFUSE unless `confirmApply === true` (the agent must pass
 * explicit confirmation, mirroring the CLI's --apply opt-in). Throwing surfaces a
 * structured tool error to the caller. Every engine safeguard is preserved by
 * reuse: only the three deterministic gated rules apply, the operation is
 * idempotent, it never pushes git, and it never touches provider accounts.
 */
export function applyFixHandler(args: unknown): CallToolResult {
  const { findings, workspaceDir, confirmApply } = applyFixInputSchema.parse(args);
  if (confirmApply !== true) {
    throw new Error(
      "apply_fix requires confirmApply:true to write changes. Use plan_fix for a dry-run diff (no writes).",
    );
  }
  const results = runFixEngine({
    findings: findings as readonly Finding[],
    workspaceDir,
    apply: true,
  });
  const writtenFiles = results.map((r) => r.filePath);
  const payload = { results, writtenFiles };
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
}
