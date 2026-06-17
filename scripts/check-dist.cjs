#!/usr/bin/env node
// Staleness guard for the committed bundle. Rebuilds dist/cli/index.js into a
// throwaway temp dir and compares it (newline-normalized) against the tracked
// dist/cli/index.js. Fails if they differ or the committed bundle is missing —
// i.e. src/ changed without a rebuild, so the dist/ that ships to copy-only
// plugin installs (Claude Code / Codex) would be stale.
//
// Run: node scripts/check-dist.cjs   (CI / pre-commit / pre-DONE gate)
// Zero dependencies (Node stdlib only). CommonJS (.cjs).

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const committed = path.join(root, 'dist', 'cli', 'index.js');

function fail(msg) {
  process.stderr.write(`check:dist FAIL -- ${msg}\n`);
  process.exit(1);
}

function norm(s) {
  return s.replace(/\r\n/g, '\n');
}

if (!fs.existsSync(committed)) {
  fail('committed bundle missing: dist/cli/index.js (run `pnpm build`, then commit dist/)');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-distcheck-'));
try {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'bundle.mjs')], {
    cwd: root,
    env: Object.assign({}, process.env, { COSTGUARD_DIST_DIR: tmp }),
    stdio: 'inherit',
  });

  const fresh = path.join(tmp, 'cli', 'index.js');
  if (!fs.existsSync(fresh)) fail('fresh build did not emit cli/index.js');

  const committedSrc = norm(fs.readFileSync(committed, 'utf8'));
  const freshSrc = norm(fs.readFileSync(fresh, 'utf8'));
  if (committedSrc !== freshSrc) {
    fail('committed dist/cli/index.js is STALE vs a fresh build -- run `pnpm build` and commit dist/');
  }

  process.stdout.write('check:dist OK -- committed dist/cli/index.js matches a fresh build\n');
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // best-effort temp cleanup
  }
}
