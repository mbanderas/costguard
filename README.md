# CostGuard

CostGuard audits your workspaces for cloud and CI cost leaks. It has two halves that share one finding model and one report:

- **Half A — static, zero-credential.** Reads GitHub Actions workflow files and application code to surface expensive patterns: redundant CI runs, missing timeouts, missing concurrency cancellation, `paths-ignore` gaps, and over-scheduled crons. Never calls a billing API.
- **Half B — read-only provider billing (opt-in).** When a provider token is present, reconciles live billed resources against the registry's `active{}` allowlist and flags **orphaned** (billed but undeclared) and **over-provisioned** (drift) resources, each with a best-effort `$/mo`. All provider calls are strictly read-only.

On top of those it can auto-fix the safe CI rules in-repo (`fix`) and render a concise monthly digest. Phases 1 through 5 are shipped; see [DESIGN.md §13](DESIGN.md) for the roadmap status.

---

## Install

```sh
pnpm install
pnpm build
```

Commands below invoke the built CLI as `node dist/cli/index.js <command>`. If you install it on your `PATH`, the same commands read `costguard <command>`.

---

## Use from your coding agent (plugins + portable installer)

CostGuard ships as a native plugin for Claude Code and Codex, and a portable
installer drops a thin adapter into any other agent CLI. Every path drives the
**same built CLI**, so build it first from the checkout:

```sh
pnpm install
pnpm build
```

> The plugins and adapters run `node "<costguard>/dist/cli/index.js"` (Claude
> Code resolves `<costguard>` as `${CLAUDE_PLUGIN_ROOT}`). They read the
> `workspaces.json` registry from the **current working directory** — run them
> from a project that has one, or run `registry --init` first. Not published to
> npm yet: install from this checkout.

**Claude Code / Desktop** — native plugin (`/costguard-audit`, `/costguard-fix`, and the `costguard` skill):

```sh
/plugin marketplace add mbanderas/costguard
/plugin install costguard@costguard
```

The two slash commands wrap `audit` and `fix`; the bundled `costguard` skill
covers the full CLI (scan, providers, registry, report, digest).

**Codex CLI / Desktop** — native Codex plugin (bundled `costguard` skill):

```sh
codex plugin marketplace add mbanderas/costguard
codex plugin add costguard@costguard
```

**Other CLIs / Desktop apps** — portable installer (zero-dependency, no-clobber, idempotent):

| Tool | Command |
|------|---------|
| Cursor | `node scripts/install.cjs --target cursor` |
| Gemini CLI | `node scripts/install.cjs --target gemini` |
| Cline | `node scripts/install.cjs --target cline` |
| Windsurf | `node scripts/install.cjs --target windsurf` |
| Codex (project files) | `node scripts/install.cjs --target codex` |
| Not sure / auto-detect | `node scripts/install.cjs --target auto` |

Each install lays down that tool's `/costguard` command, skill, or workflow in
the target project (it never overwrites an existing file). Add `--user` for the
host's global path where supported, `--dry-run` to preview, and `--help` for
the full usage. Put `costguard` on your `PATH` (e.g. `npm link` from the
checkout) so the adapters can call it as a bare command, or they fall back to
`node "<costguard>/dist/cli/index.js"`.

---

## Commands

All commands operate on the `workspaces.json` registry in the project root. Workspace selection is by directory name; `--all` selects every registered workspace.

### audit

Run the static CI/cron audit, optionally adding read-only provider billing checks, and print a report to stdout.

```sh
# Audit a single workspace (static checks only)
node dist/cli/index.js audit gameframe-v2

# Audit everything at once
node dist/cli/index.js audit --all

# CI-minutes check only
node dist/cli/index.js audit gameframe-v2 --ci-only

# Cron check only, JSON output
node dist/cli/index.js audit gameframe-v2 --crons-only --json

# Add provider billing checks for specific providers (only those whose token is present)
node dist/cli/index.js audit --all --providers github,supabase

# Add provider checks for every provider whose token is present
node dist/cli/index.js audit --all --providers all
```

| Option | Effect |
|--------|--------|
| `--all` | Audit all registered workspaces |
| `--ci-only` | Run only the CI-minute checks |
| `--crons-only` | Run only the cron-frequency checks |
| `--providers <list>` | Add read-only provider billing checks. Comma-separated ids (`github,supabase,railway,netlify,neon`) or `all`. A provider is only contacted when its token is present (see [Environment variables](#environment-variables)); others are silently skipped. |
| `--json` | Emit JSON instead of Markdown |

### scan

Static-only audit across all workspaces. A convenience alias intended for a single catch-all CI step; it never touches provider credentials.

```sh
node dist/cli/index.js scan
node dist/cli/index.js scan --ci      # CI minutes only
node dist/cli/index.js scan --crons   # Cron schedules only
```

### providers

Report which provider tokens are present in the environment, by environment-variable **name** only. Secret values are never read into output, printed, or logged.

```sh
node dist/cli/index.js providers --check
```

`--check` is the default action.

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

### fix

Deterministically auto-fix the safe CI rules in-repo: `paths-ignore`, `concurrency`, and `timeout-minutes`. It only edits `.github/workflows/*` files inside the target workspace and **never** touches provider or cloud state. It **defaults to a dry run** — it prints a unified diff and writes nothing until you pass `--apply`.

```sh
# Dry run: print the unified diff for a workspace, write nothing (default)
node dist/cli/index.js fix gameframe-v2

# Dry run across all workspaces
node dist/cli/index.js fix --all

# Write the edits to disk (idempotent — safe to re-run)
node dist/cli/index.js fix gameframe-v2 --apply

# Write local PR artifacts (branch name, patch, PR body) under ~/.costguard/pr/
node dist/cli/index.js fix gameframe-v2 --pr
```

| Option | Effect |
|--------|--------|
| `--all` | Fix all registered workspaces |
| `--apply` | Write the edits to disk. Idempotent. Omit for a dry-run preview. |
| `--pr` | Write local PR artifacts (`branch.txt`, `fix.patch`, `pr-body.md`) under `~/.costguard/pr/<workspace>/`. No network or git action. |
| `--open-pr` | **Gated and inert.** Refuses unless **both** the `--open-pr` flag and a non-empty `GITHUB_TOKEN` are present, and even then performs **no** git branch, commit, or push — this build is dry-run only. |

### digest

Produce a concise **monthly** summary — total `$/mo`, a per-provider breakdown, and the top findings — distinct from the full `report`. It **defaults to printing to stdout** (a dry run). The digest deliberately omits per-finding `detail`/`fix` text; run `report --last` for the full breakdown.

```sh
# Print the monthly digest to stdout (default)
node dist/cli/index.js digest --all

# Render from the last saved run
node dist/cli/index.js digest --last

# JSON output
node dist/cli/index.js digest --all --json

# Write it to a local file instead of stdout
node dist/cli/index.js digest --all --out digest-2026-05.md
```

| Option | Effect |
|--------|--------|
| `--all` | Build the digest across all registered workspaces |
| `--last` | Render the digest from the last saved run instead of re-scanning |
| `--json` | Emit JSON instead of Markdown |
| `--out <file>` | Write the digest to a local file instead of stdout |
| `--post` | **Gated and inert.** Requires **both** the `--post` flag and a `COSTGUARD_DIGEST_WEBHOOK` env var; even then it performs **no** network post. It only reports the message it *would* post. |

---

## Environment variables

Provider tokens are read **only** from the process environment or a gitignored `.env` in the CostGuard workspace. They are never printed, logged, or committed. Each provider module runs only when one of its tokens is present; offline, the modules are fully exercised by fixtures. All tokens are used **read-only**.

| Variable (any one of) | Provider | Used for |
|-----------------------|----------|----------|
| `GITHUB_TOKEN` / `GH_TOKEN` | github | Actions usage per repo (read-only billing PAT) |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_TOKEN` | supabase | Projects, compute size, PITR, branches |
| `RAILWAY_TOKEN` / `RAILWAY_API_TOKEN` | railway | Services, deploys, usage (read-only GraphQL) |
| `NETLIFY_AUTH_TOKEN` / `NETLIFY_TOKEN` | netlify | Sites, build minutes, bandwidth |
| `NEON_API_KEY` / `NEON_API_TOKEN` | neon | Projects, branches, compute hours |
| `COSTGUARD_DIGEST_WEBHOOK` | — | Optional `digest --post` destination (inert in this build) |

Use `providers --check` to confirm which tokens the environment exposes without revealing any value.

---

## Provider modules

Half B ships five read-only, opt-in provider modules. Each reads live billed resources, reconciles them against the registry `active{}` allowlist, and emits `orphaned` and `over-provisioned` findings with a best-effort `$/mo`.

| Module | Reads | Flags |
|--------|-------|-------|
| **github** | Actions usage per repo | top minute-burners; repos over budget |
| **supabase** | Projects, compute size, PITR/add-ons, branches | running preview branches; compute/PITR drift vs registry |
| **railway** | Services, deploys, usage (read-only GraphQL queries) | idle services; deploys never torn down |
| **netlify** | Sites, build minutes, bandwidth | build-minute spend; runaway bandwidth |
| **neon** | Projects, branches, compute hours | idle branches; orphaned (defunct but billed) projects |

All provider access is HTTP `GET`; the railway module uses GraphQL **queries** only, guarded against mutations. No module ever issues a write or delete call. A module activates only when its token (above) is present; otherwise it is skipped.

---

## Security / read-only posture

CostGuard is built to be safe to run anywhere, including on a schedule:

- **Read-only provider access only.** No write or mutating API call is ever issued. Provider tokens are read-only and are never printed, logged, or committed.
- **Secrets stay out of the repo.** Tokens are read from the environment or a gitignored `.env*` only. `providers --check` reports presence by variable name, never by value.
- **The static half needs no credentials.** `audit` (without `--providers`) and `scan` read only local files and are always safe to run.
- **`fix` is in-repo and dry-run by default.** It edits only `.github/workflows/*` files in the target workspace, never provider or cloud state, and writes nothing until `--apply`.
- **Outward actions are inert and gated.** `fix --open-pr` and `digest --post` refuse to act without an explicit opt-in flag *and* the matching credential, and even then perform no git push or network post in this build.

---

## Scheduler template

A monthly digest can be wired to GitHub Actions via the documented, **inert** scheduler template `templates/costguard-digest.yml`.

- It lives under `templates/` — **not** `.github/workflows/` — so it never runs automatically and is not enabled by this project.
- **To activate:** a human copies it into `.github/workflows/` in the target repo and supplies the required secrets (e.g. `COSTGUARD_DIGEST_WEBHOOK`).
- **To roll back:** delete the copy from `.github/workflows/`.

Activating the template is a deliberate human action outside CostGuard's own runtime.

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

The `active{}` block is the allowlist used by the Half B provider checks: any live resource not listed there is flagged as **orphaned**, and any resource larger or more capable than declared is flagged as **over-provisioned**. Leave it empty if you only run the static half; the provider modules then have nothing to reconcile against.

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
