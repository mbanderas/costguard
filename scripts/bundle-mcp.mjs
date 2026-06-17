// Costguard MCP build: bundle the stdio MCP server into a single self-contained
// ESM file so the committed dist/mcp/server.js runs from a copy-only plugin
// install with NO `npm install` and NO build step (same zero-install contract as
// the CLI bundle). The plugin's `.mcp.json` launches it as
// `node ${CLAUDE_PLUGIN_ROOT}/dist/mcp/server.js`, so every runtime dependency
// (@modelcontextprotocol/sdk, zod, ...) is inlined. Node built-ins stay external
// (auto for platform "node").
//
// Run: `pnpm build:mcp` (node scripts/bundle-mcp.mjs). Mirrors scripts/bundle.mjs.

import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Output base is dist/ by default; an override (COSTGUARD_DIST_DIR) lets a check
// build emit to a temp dir. Only the mcp/ subtree is cleaned so the sibling
// dist/cli bundle is never clobbered.
const distDir = process.env.COSTGUARD_DIST_DIR
  ? path.resolve(process.env.COSTGUARD_DIST_DIR)
  : path.join(root, "dist");
const mcpDir = path.join(distDir, "mcp");
const outfile = path.join(mcpDir, "server.js");

rmSync(mcpDir, { recursive: true, force: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "src", "mcp", "server.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // The entry's `#!/usr/bin/env node` hashbang is preserved by esbuild. The
  // banner restores a real CommonJS `require` so bundled CJS dependencies can
  // `require("node:*")` under ESM output (see scripts/bundle.mjs for rationale).
  banner: {
    js: [
      "import { createRequire as __cgCreateRequire } from 'node:module';",
      "const require = __cgCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});
