---
name: costguard
description: Find and quantify CI/cron and cloud-spend waste. Audit repos, run read-only provider billing checks, preview or apply CI auto-fixes, and render a monthly cost digest.
---

Drive **Costguard** — a read-only cost auditor for CI minutes, cron schedules,
and cloud provider billing (GitHub Actions, Supabase, Railway, Netlify, Neon).
It finds waste, estimates the monthly dollar cost, and can surgically auto-fix
CI workflow files. It never writes to provider accounts, never pushes git, and
never prints tokens.

Map the user's request to one Costguard CLI call and run it from the repo root.

## Command launcher

Costguard reads a `workspaces.json` registry from the **current working
directory**, so run it from a project that has one (or run
`registry init` first).

- If `costguard` is on `PATH`, use it directly: `costguard <subcommand> ...`.
- Otherwise, when this skill is loaded from the Costguard plugin, run the
  bundled build. Locate the plugin root (the dir containing
  `dist/cli/index.js`; in Claude Code it is `${CLAUDE_PLUGIN_ROOT}`, in Codex
  walk up from this `SKILL.md` to the dir holding `.codex-plugin/plugin.json`)
  and run:

  ```bash
  node "<plugin-root>/dist/cli/index.js" <subcommand> ...
  ```

Below, `costguard <subcommand>` means either form. If `dist/cli/index.js` is
missing, build it once from the costguard checkout with `pnpm build`.

## 1. Audit for waste (the main action)

```bash
costguard audit <workspace...>            # named workspaces
costguard audit --all                     # every registered workspace
costguard audit <ws> --providers all      # + read-only cloud billing checks
costguard audit <ws> --ci-only            # static CI checks only
costguard audit <ws> --crons-only         # cron checks only
costguard audit <ws> --json               # JSON instead of Markdown
```

Prints a report: each finding has a severity, an estimated monthly USD cost, a
detail, and a fix suggestion. Report stdout verbatim.

## 2. Scan / registry / report

```bash
costguard scan                # discover CI + cron files under the registry root
costguard registry list       # show registered workspaces
costguard registry init       # create a workspaces.json in the cwd
costguard report              # re-render the last saved audit run
```

## 3. Auto-fix CI files (dry-run first)

```bash
costguard fix <ws>            # dry-run: print a unified-diff preview, write nothing
costguard fix <ws> --apply    # write the surgical edits to disk (idempotent)
costguard fix <ws> --pr       # also emit local PR artifacts (no push)
```

Default is dry-run. Only deterministic ADD-rule fixers run (timeout,
concurrency, paths-ignore). Costguard never pushes; `--open-pr` is gated and
refuses without an explicit token.

## 4. Monthly cost digest

```bash
costguard digest             # render the digest from the last run (dry-run)
costguard digest --post      # delivery adapter (inert unless configured)
```

## Provider billing checks

`--providers <ids|all>` adds read-only billing checks for the providers listed
on each workspace in `workspaces.json`. Tokens are read from the environment /
`.env` only. A provider whose token env var is absent is **skipped**, not
failed. Supported: `github`, `supabase`, `railway`, `netlify`, `neon`.

## Notes

- All provider calls are read-only (GET / read-only GraphQL). No POST/PUT/PATCH/
  DELETE to provider accounts.
- Estimated dollar costs are best-effort and depend on plan/tier; treat them as
  directional, not invoices.
- Requires `node` on `PATH`. The bare `costguard` command is optional when the
  skill runs from the plugin — use the plugin-root `node` launcher above.
