# CostGuard

CostGuard audits your workspaces for CI-minute and cron-schedule waste. Phase 1 (this release) is the static, zero-credential half: it reads GitHub Actions workflow files and application code to surface expensive patterns — redundant CI runs, missing timeouts, over-scheduled crons — without ever calling a billing API.

---

## Install

```sh
pnpm install
pnpm build
```

---

## Usage

All commands operate on the `workspaces.json` registry in the project root.

### audit

Audit one or more workspaces and print a Markdown report to stdout.

```sh
# Audit a single workspace
node dist/cli/index.js audit gameframe-v2

# Audit everything at once
node dist/cli/index.js audit --all

# CI-minutes check only, exit 1 if any HIGH finding
node dist/cli/index.js audit gameframe-v2 --ci-only

# Cron check only, JSON output
node dist/cli/index.js audit gameframe-v2 --crons-only --json
```

Options: `--all`, `--ci-only`, `--crons-only`, `--json`

### scan

Static alias for `audit --all`. Intended for a single catch-all CI step.

```sh
node dist/cli/index.js scan
node dist/cli/index.js scan --ci      # CI minutes only
node dist/cli/index.js scan --crons   # Cron schedules only
```

### registry

Manage the workspace registry (`workspaces.json`).

```sh
# List all registered workspaces and detected providers
node dist/cli/index.js registry --list

# Validate the registry against the filesystem
node dist/cli/index.js registry --validate

# Scan ~/Workspaces and write a fresh workspaces.json
node dist/cli/index.js registry --init
```

`--list` is the default when no option is given.

### report

Re-render the most recent saved audit run without re-scanning.

```sh
node dist/cli/index.js report --last
node dist/cli/index.js report --last --json
```

---

## How workspaces.json works

`workspaces.json` is the registry of projects CostGuard tracks. `registry --init` scans `workspacesRoot` (default: `~/Workspaces`) and writes a fresh file with auto-detected `providers` arrays (GitHub, Netlify, Supabase, etc.) and blank `active{}` blocks.

```json
{
  "root": "~/Workspaces",
  "workspaces": {
    "my-app": {
      "providers": ["github", "netlify"],
      "active": {}
    }
  }
}
```

The `active{}` block is reserved for Phase 2 (Half B) provider billing credentials. Leave it empty for Phase 1; CostGuard will skip it.

---

## Configuration

Create `costguard.config.json` in the project root to override defaults:

```json
{
  "workspacesRoot": "~/Workspaces",
  "defaults": {
    "cronThresholdMinutes": 15,
    "ciMinuteRate": 0.008,
    "assumedPushesPerDay": 10,
    "assumedMinutesPerRun": 5
  },
  "perWorkspace": {
    "my-app": {
      "cronThresholdMinutes": 30
    }
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `cronThresholdMinutes` | `15` | Crons running more often than this threshold are flagged |
| `ciMinuteRate` | `0.008` | USD per runner-minute (GitHub-hosted Linux) |
| `assumedPushesPerDay` | `10` | Estimated daily push cadence for cost projection |
| `assumedMinutesPerRun` | `5` | Assumed wasted minutes per redundant CI run |

Per-workspace overrides in `perWorkspace` merge on top of `defaults`.

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed (or only INFO/WARN findings) |
| `1` | At least one HIGH severity finding (CI gate signal) |
| `1` | Error loading registry, config, or invalid arguments |

---

## Phase 1 scope

Phase 1 is the static half — no credentials, no API calls, reads only local files:

- CI: missing `timeout-minutes`, missing `concurrency`/cancel-in-progress, `paths-ignore` gaps, `actionlint` correctness (if installed)
- Cron: over-frequent schedules, redundant or overlapping triggers

**Not yet built (Phase 2 / Half B):**
- Live billing data from GitHub, Netlify, Supabase, Railway, Vercel, Neon, Inngest
- `--fix` auto-remediation
- `active{}` block credential wiring
