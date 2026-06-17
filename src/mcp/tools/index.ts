import type { ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * One MCP tool: a name, an agent-facing description, the zod *raw shape* used for
 * boundary validation (pass `someInputSchema.shape`), and a handler that wraps
 * exactly one engine function and returns an MCP `CallToolResult`. This registry
 * is the single place `server.ts` reads to register tools; P2 (read), P3 (fix),
 * and P4 (live) each ADD entries here — no interface changes (the G1 cross-talk
 * contract: the only shared file across the parallel group is this registry).
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly handler: (args: unknown) => CallToolResult | Promise<CallToolResult>;
}

/** Empty-but-typed at P1; populated by P2 (read), P3 (fix), P4 (live). */
export const tools: readonly ToolDefinition[] = [];
