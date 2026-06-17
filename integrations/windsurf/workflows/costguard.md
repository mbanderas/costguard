---
description: Costguard — audit repos and cloud accounts for CI/cron and spend waste, and auto-fix CI files
---

Drive **Costguard**, a read-only cost auditor (CI minutes, cron schedules, and
cloud provider billing: GitHub Actions, Supabase, Railway, Netlify, Neon). It
finds waste, estimates the monthly dollar cost, and can surgically auto-fix CI
workflow files. It never writes to provider accounts, never pushes git, and
never prints tokens.

Requested action: `$ARGUMENTS`

Map it to one Costguard CLI call and run it from the repo root. Costguard reads
a `workspaces.json` registry from the **current working directory** — run it
from a project that has one (or run `costguard registry init` first).

Command launcher: use `costguard` if it is on `PATH`; otherwise run the built
CLI from your costguard checkout: `node <costguard>/dist/cli/index.js`. Below,
`costguard` means either form.

1. Audit for waste:

   ```bash
   costguard audit <workspace...>          # named workspaces
   costguard audit --all                    # every registered workspace
   costguard audit <ws> --providers all     # + read-only cloud billing checks
   ```

2. Preview or apply CI auto-fixes (dry-run by default):

   ```bash
   costguard fix <ws>            # dry-run: print a unified-diff preview
   costguard fix <ws> --apply    # write the surgical edits to disk (idempotent)
   ```

Report the CLI's stdout verbatim — it is the cost report or fix preview. On a
non-zero exit, relay the `Error:` line.

Notes:

- All provider billing checks are read-only (GET / read-only GraphQL). Tokens
  are read from the environment / `.env` only; a provider with no token present
  is skipped, not failed.
- Estimated dollar costs are best-effort and depend on plan/tier.
- Requires `node` on `PATH` and a built costguard `dist/` (`pnpm build` once).
