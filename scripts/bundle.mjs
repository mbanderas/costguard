// Costguard build: bundle the CLI into a single self-contained ESM file so the
// committed dist/ runs from a fresh checkout with NO `npm install` and NO build
// step. Claude Code / Codex plugin installs copy files only (no install, no
// postinstall), so every runtime dependency (commander, zod, yaml, js-yaml,
// cron-parser, diff) must be inlined into dist/cli/index.js. Node built-ins stay
// external (auto for platform "node"). knowledge/*.json stays an external shipped
// asset, resolved at runtime via src/knowledge/paths.ts relative to this single
// bundle file (dist/cli/index.js -> ../../knowledge).
//
// Run: `pnpm build` (node scripts/bundle.mjs). Zero-config; no tsconfig.build.json.

import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Output base is dist/ by default; scripts/check-dist.cjs overrides it to a temp
// dir (via COSTGUARD_DIST_DIR) to diff a fresh build against the committed one
// without clobbering it.
const distDir = process.env.COSTGUARD_DIST_DIR
  ? path.resolve(process.env.COSTGUARD_DIST_DIR)
  : path.join(root, "dist");
const outfile = path.join(distDir, "cli", "index.js");

// Clean the output dir so a stale tree never lingers next to the single-file bundle.
rmSync(distDir, { recursive: true, force: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "src", "cli", "index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // The entry's `#!/usr/bin/env node` hashbang is preserved by esbuild (emitted
  // before this banner). The banner restores a real CommonJS `require` so the
  // bundled CJS dependencies (e.g. commander) can `require("node:events")` —
  // without it, esbuild's ESM output emits a `require` shim that throws
  // "Dynamic require of X is not supported".
  banner: {
    js: [
      "import { createRequire as __cgCreateRequire } from 'node:module';",
      "const require = __cgCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});
