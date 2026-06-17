#!/usr/bin/env node
// costguard MCP server: a thin, host-agnostic capability surface over the existing
// engine. Bootstraps an McpServer, registers every tool from the registry, and
// serves over stdio. Holds NO engine logic and writes nothing to stdout (the
// stdio transport owns stdout; the SDK logs over the protocol/stderr); each
// registered tool adapter wraps exactly one engine function.
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools, type ToolDefinition } from "./tools/index.js";

// Mirrors package.json "version"; the bundled single-file server has no JSON
// import path, so the value is inlined here.
const VERSION = "0.1.0";

const INSTRUCTIONS = [
  "costguard audits cloud-cost waste across your local workspaces. Read-only by",
  "default; it never prints secrets, never pushes git, and never drives a browser",
  "itself. Tool categories:",
  "- read: audit_workspace, discover_providers, audit_site — detect cost waste and",
  "  return Findings; no writes.",
  "- fix: plan_fix returns unified diffs only; apply_fix writes local CI-workflow",
  "  files for the three gated rules and REQUIRES confirmApply:true.",
  "- live: plan_live_checks returns a read-only browser playbook and",
  "  ingest_live_reading parses what the playwriter MCP server read back. Live mode",
  "  is opt-in and consent-gated; browser reads are performed by playwriter, not by",
  "  costguard.",
].join("\n");

function registerTool(server: McpServer, tool: ToolDefinition): void {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema },
    (args) => tool.handler(args),
  );
}

/** Build a fully-wired server (no transport attached). Exported for in-memory tests. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: "costguard", version: VERSION },
    { instructions: INSTRUCTIONS },
  );
  for (const tool of tools) registerTool(server, tool);
  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Start the stdio server only when launched directly (node dist/mcp/server.js),
// never when imported by a test or another module.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  void main();
}
