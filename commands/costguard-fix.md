---
description: Auto-fix CI workflow waste (add timeouts, concurrency, paths-ignore) for registered workspaces. Dry-run preview by default; --apply writes the surgical edits to disk.
argument-hint: "<workspaces... | --all> [--apply] [--pr]"
allowed-tools: Bash, Read
---

Apply Costguard's CI auto-fixes (or preview them).

Requested action: `$ARGUMENTS`

Costguard is a built CLI bundled with this plugin at
`${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js`. It reads a `workspaces.json`
registry from the **current working directory**.

1. Run the fixer, passing the user's arguments straight through:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js" fix $ARGUMENTS
   ```

   - **Default is dry-run**: with no `--apply`, the CLI prints a unified-diff
     preview of every change and writes nothing. Show that preview to the user.
   - `--apply` writes the surgical edits to the workspace's CI files on disk
     (only the deterministic ADD-rule fixers: timeout, concurrency,
     paths-ignore). It is idempotent — re-running applies nothing new.
   - `--pr` additionally writes local PR artifacts (`branch.txt`, `fix.patch`,
     `pr-body.md`); it does **not** push or open anything by itself.
   - A name or `--all` is required, else the CLI prints `Error: specify
     workspaces or --all`.

2. Report the CLI's stdout verbatim (the diff preview, or the applied-rules
   summary). Relay any `Error:` line on non-zero exit.

Notes:

- **Prerequisite:** the plugin runs the built `dist/`. If
  `${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js` is missing, run `pnpm build` once
  from the costguard checkout.
- Costguard **never pushes git**. `--open-pr` is gated and refuses without an
  explicit token; even then it only opens a PR, never force-pushes. For the
  normal flow, prefer `--apply` (or `--pr` for reviewable artifacts) and let the
  human commit.
- Only auto-fixable findings (the in-repo CI files) are touched. Cloud/provider
  findings are advisory and never auto-fixed.
