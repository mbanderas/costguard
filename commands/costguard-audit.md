---
description: Audit registered workspaces for CI-minute and cron waste, plus read-only cloud provider billing checks. Quantifies estimated monthly waste and prints a Markdown (or JSON) report.
argument-hint: "<workspaces... | --all> [--ci-only] [--crons-only] [--providers <ids|all>] [--json]"
allowed-tools: Bash, Read
---

Run a Costguard cost audit and report the findings.

Requested action: `$ARGUMENTS`

Costguard is a built CLI bundled with this plugin at
`${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js`. It reads a `workspaces.json`
registry from the **current working directory** — run from a repo that has one
(e.g. the costguard checkout, or any project where you ran
`costguard registry init`).

1. Run the audit, passing the user's arguments straight through:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js" audit $ARGUMENTS
   ```

   - No workspace named and no `--all`: the CLI lists what is available — pass
     a workspace name (e.g. `CiteSurge`) or `--all`.
   - `--providers all` (or a comma list like `--providers github,netlify`) adds
     read-only cloud billing checks; provider modules whose token env var is
     absent are skipped, not failed.
   - `--ci-only` / `--crons-only` narrow the static checks; `--json` emits JSON.

2. Report the CLI's stdout verbatim — it is the cost report (estimated monthly
   waste per finding, with a fix suggestion). On a non-zero exit, relay the
   `Error: <message>` line.

Notes:

- **Prerequisite:** the plugin runs the built `dist/`. If
  `${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js` is missing, build it once from the
  costguard checkout with `pnpm build` (then `pnpm install` if deps are absent).
- All billing checks are **read-only** (GET / read-only GraphQL only). Costguard
  never writes to provider accounts and never prints tokens.
- Tokens are read from the environment / `.env` only. A workspace's providers
  are listed in `workspaces.json`; a provider with no token present is skipped.
