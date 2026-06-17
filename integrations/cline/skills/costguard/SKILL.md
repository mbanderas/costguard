---
name: costguard
description: Find and quantify CI/cron and cloud-spend waste. Audit repos, run read-only provider billing checks, preview or apply CI auto-fixes, and render a monthly cost digest.
---

Drive **Costguard**, a read-only cost auditor for CI minutes, cron schedules,
and cloud provider billing (GitHub Actions, Supabase, Railway, Netlify, Neon).
It finds waste, estimates the monthly dollar cost, and can surgically auto-fix
CI workflow files. It never writes to provider accounts, never pushes git, and
never prints tokens.

Map the user's request to one Costguard CLI call and run it from the repo root.
Costguard reads a `workspaces.json` registry from the **current working
directory** — run it from a project that has one (or run `costguard registry
init` first).

Install this skill: `npx -y -p @costguard/costguard-mcp costguard install --target cline`.

Command launcher: run `npx -y -p @costguard/costguard-mcp costguard <args>`, or
`costguard <args>` if installed globally (`npm i -g @costguard/costguard-mcp`).
Below, `costguard` means either form.

## 1. Audit for waste (the main action)

```bash
costguard audit <workspace...>          # named workspaces
costguard audit --all                    # every registered workspace
costguard audit <ws> --providers all     # + read-only cloud billing checks
costguard audit <ws> --ci-only           # static CI checks only
costguard audit <ws> --json              # JSON instead of Markdown
```

## 2. Auto-fix CI files (dry-run first)

```bash
costguard fix <ws>            # dry-run: print a unified-diff preview, write nothing
costguard fix <ws> --apply    # write the surgical edits to disk (idempotent)
```

## 3. Other commands

```bash
costguard scan               # discover CI + cron files under the registry root
costguard registry list      # show registered workspaces
costguard report             # re-render the last saved audit run
costguard digest             # render the monthly cost digest (dry-run)
```

## Notes

- Provider billing checks are read-only (GET / read-only GraphQL). Tokens are
  read from the environment / `.env` only; a provider with no token present is
  skipped, not failed. Supported: `github`, `supabase`, `railway`, `netlify`, `neon`.
- Estimated dollar costs are best-effort and depend on plan/tier.
