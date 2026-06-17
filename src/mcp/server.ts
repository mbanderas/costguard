#!/usr/bin/env node
// costguard MCP server entry. P0 stub: present so the esbuild `build:mcp` target
// has an entry to bundle into dist/mcp/server.js. The real McpServer bootstrap
// (StdioServerTransport + tool registry) lands in P1, replacing this file.
export {};
