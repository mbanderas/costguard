import type { ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  auditWorkspaceInputSchema,
  discoverProvidersInputSchema,
  auditSiteInputSchema,
} from "../schemas.js";
import { auditWorkspaceHandler } from "./auditWorkspace.js";
import { discoverProvidersHandler } from "./discoverProviders.js";
import { auditSiteHandler } from "./auditSite.js";

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

/** Populated by P2 (read), P3 (fix), P4 (live). */
export const tools: readonly ToolDefinition[] = [
  {
    name: "audit_workspace",
    description:
      "Audit registered workspaces for cloud-cost waste (CI minutes, cron cadence). Read-only. Returns a Findings envelope with totalMonthlyUsd over cost findings. Set all=true for every workspace, or pass workspaces[]; includeSite adds read-only live-site checks.",
    inputSchema: auditWorkspaceInputSchema.shape,
    handler: auditWorkspaceHandler,
  },
  {
    name: "discover_providers",
    description:
      "Detect which cloud providers a directory uses, from config files, dependency names, and env-var NAMES (never values). Read-only.",
    inputSchema: discoverProvidersInputSchema.shape,
    handler: discoverProvidersHandler,
  },
  {
    name: "audit_site",
    description:
      "Run read-only GET-only live-site checks against the given URLs (no browser, no form submit, no credential replay). Returns a Findings envelope.",
    inputSchema: auditSiteInputSchema.shape,
    handler: auditSiteHandler,
  },
];
