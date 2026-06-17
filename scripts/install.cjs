#!/usr/bin/env node
// Costguard portable installer — lays down a per-host adapter (slash command /
// skill / workflow) that drives the Costguard CLI into a target project. The
// adapters are no-clobber (an existing file is never overwritten) and the
// installer is idempotent and safe to re-run. Zero dependencies (Node stdlib
// only). CommonJS (.cjs).
//
// Usage (as script): node scripts/install.cjs --target <host> [flags]
// Usage (as module): const { run } = require('./install.cjs'); run(argv);

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PKG_ROOT = path.join(__dirname, '..');

// Map target -> { src (relative to PKG_ROOT), proj (project-relative dest),
// user (() => absolute global dest) | null }.
const WRAPPER_MAP = {
  cursor: {
    src: 'integrations/cursor/commands/costguard.md',
    proj: '.cursor/commands/costguard.md',
    user: null, // no global path for cursor
  },
  gemini: {
    src: 'integrations/gemini/commands/costguard.toml',
    proj: '.gemini/commands/costguard.toml',
    user: () => path.join(homeDir(), '.gemini', 'commands', 'costguard.toml'),
  },
  cline: {
    src: 'integrations/cline/skills/costguard/SKILL.md',
    proj: '.cline/skills/costguard/SKILL.md',
    user: () => path.join(homeDir(), '.cline', 'skills', 'costguard', 'SKILL.md'),
  },
  windsurf: {
    src: 'integrations/windsurf/workflows/costguard.md',
    proj: '.windsurf/workflows/costguard.md',
    user: () => path.join(homeDir(), '.codeium', 'windsurf', 'global_workflows', 'costguard.md'),
  },
  // Codex reuses the shared plugin skill as a portable fallback skill.
  codex: {
    src: 'skills/costguard/SKILL.md',
    proj: '.agents/skills/costguard/SKILL.md',
    user: () => path.join(homeDir(), '.agents', 'skills', 'costguard', 'SKILL.md'),
  },
};

// Marker dirs used for --target auto detection (scanned inside project root).
const AUTO_MARKERS = [
  { dir: '.cursor', target: 'cursor' },
  { dir: '.gemini', target: 'gemini' },
  { dir: '.codex', target: 'codex' },
  { dir: '.cline', target: 'cline' },
  { dir: '.windsurf', target: 'windsurf' },
  { dir: '.claude', target: 'claude' },
];

const VALID_TARGETS = ['auto', 'claude', 'codex', 'cursor', 'gemini', 'cline', 'windsurf'];

const HELP = `Costguard portable installer

Usage:
  node scripts/install.cjs --target <host> [--project <dir>] [--user] [--dry-run]

Targets:
  auto      Detect the host from marker dirs in the project (default)
  claude    Print Claude Code plugin install instructions (no file written)
  codex     Install the Costguard skill at .agents/skills/costguard/SKILL.md
  cursor    Install /costguard at .cursor/commands/costguard.md
  gemini    Install /costguard at .gemini/commands/costguard.toml
  cline     Install the Costguard skill at .cline/skills/costguard/SKILL.md
  windsurf  Install the Costguard workflow at .windsurf/workflows/costguard.md

Flags:
  --project <dir>  Target project root (default: cwd)
  --user           Install to the host's global/user path where supported
  --dry-run        Plan only; write nothing
  --help, -h       Show this help

The adapter is no-clobber (an existing file is preserved) and the installer is
idempotent. It drives the Costguard CLI; build it once with 'pnpm build' and put
'costguard' on PATH (or use 'node <costguard>/dist/cli/index.js').`;

// ---- safety helpers ----

function homeDir() {
  return process.platform === 'win32'
    ? process.env.USERPROFILE || os.homedir()
    : process.env.HOME || os.homedir();
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function safeMkdirp(destPath) {
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function safeWrite(dest, content) {
  if (isSymlink(path.dirname(dest))) {
    return { ok: false, reason: `parent dir is a symlink: ${path.dirname(dest)}` };
  }
  if (isSymlink(dest)) {
    return { ok: false, reason: `destination is a symlink: ${dest}` };
  }
  try {
    fs.writeFileSync(dest, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err) };
  }
}

// ---- argv ----

function parseArgs(argv) {
  const opts = {
    target: 'auto',
    project: process.cwd(),
    user: false,
    dryRun: false,
    help: false,
  };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--target' && i + 1 < argv.length) opts.target = argv[++i];
    else if (a === '--project' && i + 1 < argv.length) opts.project = argv[++i];
    else if (a === '--user') opts.user = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    i++;
  }
  opts.project = path.resolve(opts.project);
  return opts;
}

function detectTarget(projectRoot) {
  for (const { dir, target } of AUTO_MARKERS) {
    try {
      if (fs.lstatSync(path.join(projectRoot, dir)).isDirectory()) return target;
    } catch {
      // not found
    }
  }
  return 'none';
}

// ---- install a single no-clobber adapter file ----

function installWrapper(target, projectRoot, userGlobal, dryRun, log) {
  if (target === 'claude') {
    log('[claude] No wrapper file — Claude Code loads the bundled plugin directly.');
    log('[claude] Add the marketplace + install the plugin:');
    log('[claude]   /plugin marketplace add mbanderas/costguard');
    log('[claude]   /plugin install costguard@costguard');
    return true;
  }

  const mapping = WRAPPER_MAP[target];
  if (!mapping) {
    log(`ERROR: unknown target: ${target}`);
    return false;
  }

  const src = path.join(PKG_ROOT, mapping.src);

  let dest;
  if (userGlobal) {
    if (!mapping.user) {
      log(`[wrapper] --user not supported for ${target} — writing to project instead`);
      dest = path.join(projectRoot, mapping.proj);
    } else {
      dest = mapping.user();
    }
  } else {
    dest = path.join(projectRoot, mapping.proj);
  }

  // no-clobber
  let destStat;
  try {
    destStat = fs.lstatSync(dest);
  } catch {
    destStat = null;
  }
  if (destStat) {
    if (destStat.isSymbolicLink()) {
      log(`ERROR: dest is a symlink — refusing: ${dest}`);
      return false;
    }
    log(`[wrapper] skipped (exists, not clobbered): ${dest}`);
    return true;
  }

  let srcContent;
  try {
    srcContent = fs.readFileSync(src, 'utf8');
  } catch (err) {
    log(`ERROR: cannot read template ${src}: ${err.message}`);
    return false;
  }

  if (dryRun) {
    log(`[dry-run] would create ${dest}`);
    return true;
  }

  if (!safeMkdirp(dest)) {
    log(`ERROR: could not create parent dir for ${dest}`);
    return false;
  }
  const res = safeWrite(dest, srcContent);
  if (!res.ok) {
    log(`ERROR: failed to write ${dest}: ${res.reason}`);
    return false;
  }
  log(`[wrapper] wrote ${dest}`);
  return true;
}

// ---- main entry ----

function run(argv) {
  const opts = parseArgs(argv || []);
  const lines = [];
  const log = (msg) => {
    lines.push(msg);
    process.stdout.write(msg + '\n');
  };

  if (opts.help) {
    log(HELP);
    return 0;
  }

  if (!VALID_TARGETS.includes(opts.target)) {
    log(`ERROR: unknown --target value: ${opts.target}`);
    log(`valid targets: ${VALID_TARGETS.join(', ')}`);
    return 1;
  }

  if (opts.dryRun) log('[dry-run] planning only — no files will be written');

  let target = opts.target;
  if (target === 'auto') {
    target = detectTarget(opts.project);
    if (target === 'none') {
      log('[auto] no host marker dir found — pass --target <host> (cursor, gemini, cline, windsurf, codex)');
      return 1;
    }
    log(`[auto] detected target: ${target}`);
  }

  const ok = installWrapper(target, opts.project, opts.user, opts.dryRun, log);
  if (!ok) {
    log('install completed with errors (see above)');
    return 1;
  }
  log('install complete');
  return 0;
}

if (require.main === module) {
  process.exit(run(process.argv.slice(2)));
}

module.exports = { run, _test: { WRAPPER_MAP, VALID_TARGETS, parseArgs, detectTarget } };
