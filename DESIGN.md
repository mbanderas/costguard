# Costguard — Design

> Status: **Phases 1–5 shipped.** Standalone CLI in its own workspace.
> Free, open-source tool. Designed to also be usable as a library.

---

## 1. Problem

Across the workspaces, real money leaks in three recurring shapes. Each was found and
fixed by hand recently in `web-app`:

| Real fix | Failure mode | Where the signal lives |
|----------|--------------|------------------------|
| **#65** — 7 CI jobs → 1, killed double-CI on `main`, `paths-ignore` docs | redundant CI minutes | in-repo: `.github/workflows/*.yml` |
| **#62** — Inngest outbox + 2 reconcilers widened to `*/15` | scheduled job over-firing | in-repo: cron expressions in code/config |
| **cost topology** — preview branch left running (~$3.90/cyc), defunct Neon/Railway projects, PITR/compute drift | orphaned + over-provisioned cloud | external: provider billing/list APIs |

The first two are **free static repo scans**. The third needs **read-only provider credentials**.
No tool unifies all three. Costguard is that tool.

Each leak is small ($3–$30/mo) but they recur silently across every workspace and never
self-announce. The point of Costguard is to make the leak **visible on demand** and hand
back the **exact fix** — the same fix that was applied by hand.

---

## 2. Goals / non-goals

**Goals**
- One command audits a selected workspace, several, or all of them.
- Static half runs with **zero credentials** and catches the #62/#65 class everywhere.
- Billing half (opt-in, read-only tokens) surfaces real spend + orphaned resources.
- Every finding carries an **estimated $/mo** and the **concrete fix**, ranked by impact.
- Deterministic and re-runnable; safe to schedule monthly.

**Non-goals (v1)**
- Not a SaaS, dashboard, or always-on daemon. It is a CLI you run.
- Does not auto-apply fixes by default (opt-in `--fix`/PR emission later).
- Not a generic cloud-cost platform (no Infracost-style IaC pricing model).
- No write access to any provider. Read-only, always.

---

## 3. Usage model

Open Claude (or a plain shell) in the `costguard` workspace and run:

```bash
costguard audit --all                  # every registered workspace
costguard audit web-app api-service     # selected workspaces
costguard audit web-app --ci-only # static CI checks only, no creds
costguard scan --crons                 # cron-frequency checks only
costguard providers --check            # which billing tokens are present/valid
costguard report --last                # re-print last run's report
```

Workspaces are discovered by globbing siblings under a configured root
(`~/Workspaces/*`) and cross-referencing a registry (§5). Selection is by workspace
directory name.

---

## 4. Architecture

```
costguard audit
      |
      v
 +----------------+      reads workspaces.json (registry)
 |  orchestrator  |---------------------------------------+
 +----------------+                                       |
      |                                                   v
      |  for each selected workspace            +-------------------+
      |                                         |   registry: which |
      +--> Half A: static checks (no creds)     |   providers + the |
      |       - CI smell rules                  |   active-resource |
      |       - cron-frequency rules            |   allowlist       |
      |                                         +-------------------+
      +--> Half B: provider checks (read-only tokens, opt-in)
              - github / supabase / railway / netlify / neon modules
      |
      v
 +----------------+
 |  report build  |  total $/mo, findings ranked by $ impact, each with exact fix
 +----------------+
```

- **Orchestrator** — resolves selection, loads registry, runs enabled checks, aggregates.
- **Check** — small unit: takes a workspace (and optionally a provider client), returns
  zero or more `Finding`s. Pure where possible; one I/O boundary per provider check.
- **Reporter** — sorts findings by `est_monthly_usd` desc, renders Markdown + JSON.

Checks are a **registry of small modules** (pluggable). Adding a provider or a rule = add
one module; the orchestrator does not change.

---

## 5. Workspace registry — `workspaces.json`

Single source of truth for what each workspace uses and what is *expected* to be billed
(so anything billed-but-unlisted is flagged as orphaned).

```jsonc
{
  "root": "~/Workspaces",
  "workspaces": {
    "web-app": {
      "providers": ["github", "supabase", "railway", "netlify"],
      "active": {
        "supabase": { "projects": ["<ref>"], "compute": "micro", "pitr": false },
        "railway":  { "services": ["backend"] },
        "github":   { "repo": "mbanderas/web-app" }
      }
    },
    "api-service": {
      "providers": ["github", "neon", "netlify"],
      "active": { "neon": { "projects": ["<id>"] } }
    }
  }
}
```

`active` is the allowlist. A live resource not in `active` → **orphaned** finding.
Drift (e.g. `compute` larger than declared, `pitr: true` when declared `false`) →
**over-provisioned** finding.

---

## 6. Finding model

Every check emits the same shape (language-neutral):

```ts
interface Finding {
  workspace: string;
  provider: string;         // "ci" | "cron" | "github" | "supabase" | ...
  rule: string;             // stable id, e.g. "ci/double-trigger"
  severity: "info" | "warn" | "high";
  estMonthlyUsd: number;    // best-effort; 0 when unknowable but wasteful
  title: string;            // one line
  detail: string;           // what was found + where (file:line or resource id)
  fix: string;              // the exact change to make
  autofixable: boolean;     // can a future --fix apply it deterministically
}
```

Report = findings grouped by workspace, sorted by `estMonthlyUsd` desc, with a grand total.

---

## 7. Half A — static checks (no credentials)

Runs over each workspace's working tree. Fast, deterministic, the default.

### 7.1 CI smells (`.github/workflows/*.yml`)
Diff each workflow against a **known-good template** (the reference workspace's current state, §12):

| Rule id | Detects | Fix |
|---------|---------|-----|
| `ci/double-trigger` | `push` **and** `pull_request` on the same branch → every commit runs CI twice | drop `push` on PR branches; keep `pull_request` + `push` only on protected branches |
| `ci/no-paths-ignore` | no `paths-ignore` for `['**.md','docs/**']` | add docs `paths-ignore` (the #65 change) |
| `ci/no-concurrency` | missing `concurrency: { cancel-in-progress: true }` | add concurrency group keyed on ref → cancels superseded runs |
| `ci/no-timeout` | job without `timeout-minutes` → hung jobs burn minutes to the 6h cap | add a sane `timeout-minutes` |
| `ci/job-fanout` | N near-duplicate jobs that could be one (the #65 "7 jobs → 1") | collapse into one job / steps |
| `ci/matrix-overkill` | matrix dimension that multiplies runs without need | prune matrix |
| `ci/schedule-frequency` | `on: schedule:` cron firing more than daily | widen or gate on changes |

### 7.2 Cron-frequency smells (the #62 detector)
Scan for cron expressions in: Inngest `cron("...")`, `vercel.json` `crons`, Supabase
`pg_cron` / migration SQL, `node-cron`, and `on: schedule:` above.

| Rule id | Detects | Fix |
|---------|---------|-----|
| `cron/too-frequent` | interval < threshold (default 15 min) for non-realtime jobs | widen to `*/15` or longer (the #62 change) |
| `cron/overlap` | two schedules that fire on the same minute / duplicate work | stagger or merge |
| `cron/unbounded` | recurring job with no concurrency guard / could pile up | add a one-shot / lock |

Thresholds are config (`costguard.config`), per-rule overridable per workspace.

### 7.3 Implementation note
CI YAML linting wraps **`actionlint`** (correctness) and layers Costguard's cost rules on
top — actionlint does not know about cost, double-triggers, or cron frequency.

---

## 8. Half B — provider billing / resource checks (read-only, opt-in)

Each provider is a module exposing read-only list/billing calls. Enabled only when a token
is present. Start with the two providers where the real leaks were: **Supabase + GitHub**.

| Provider | Reads | Flags |
|----------|-------|-------|
| **github** | Actions minutes this cycle + per-repo breakdown (billing API) | top minute-burners; repos over budget |
| **supabase** | Management API: project compute size, PITR/add-ons, **branches** | running preview branches (the $3.90/cyc leak); compute/PITR drift vs registry |
| **railway** | GraphQL: services, deploys, usage | idle services; deploys never torn down |
| **netlify** | build minutes, bandwidth | build-minute spend; runaway bandwidth |
| **neon** | projects, branches, compute hours | idle branches; orphaned projects (defunct, still billed) |

Each module reconciles live resources against the registry `active` allowlist (§5) →
**orphaned** (billed, not listed) and **over-provisioned** (larger/more than declared).

---

## 9. Credentials & security

- **Read-only tokens only.** Billing-scope / read PATs where the provider supports them.
- Stored in OS keychain or a **gitignored** `.env` in the costguard workspace. Never committed.
- `costguard providers --check` validates presence + scope without printing secrets.
- Static half (Half A) needs **no** credentials — it is always safe to run anywhere.
- No write/delete calls in any provider module, ever. Remediation is the human's, or the
  explicit `fix` command, which only edits in-repo `.github/workflows/*` files and never
  touches provider state.
- **Digest webhook.** `COSTGUARD_DIGEST_WEBHOOK` (optional) is the destination for
  `digest --post`. Like every other secret it is read from the environment / a gitignored
  `.env` only and is never printed, logged, or committed.
- **Outward actions are inert / gated.** The two commands that could act outside the local
  filesystem are deliberately neutered in this build: `fix --open-pr` requires both the flag
  and a `GITHUB_TOKEN` yet still performs **no** git branch/commit/push, and `digest --post`
  requires both the flag and `COSTGUARD_DIGEST_WEBHOOK` yet still performs **no** network
  post (it only reports what it *would* send). Enabling a real push/post is a future,
  human-authorized change — treat any such wiring as **PENDING_REVIEW**.

---

## 10. CLI surface

```
costguard audit [workspaces...] [--all] [--ci-only] [--crons-only] [--providers <list>] [--json]
costguard scan  [--ci] [--crons]                  # static only, alias subset
costguard providers --check                       # token presence by env-var NAME only
costguard report [--last] [--json]                # re-render last run
costguard registry [--list] [--validate] [--init] # inspect/build workspaces.json
costguard fix [workspaces...] [--all] [--apply] [--pr] [--open-pr]   # in-repo CI auto-fix
costguard digest [workspaces...] [--all] [--last] [--json] [--out <file>] [--post]  # monthly summary
```

- `--providers` takes a comma-separated id list (`github,supabase,railway,netlify,neon`) or
  `all`; a provider is contacted only when its token is present.
- `fix` deterministically rewrites the safe CI rules (`paths-ignore`, `concurrency`,
  `timeout-minutes`) in-repo. It **defaults to dry-run** (prints a unified diff, writes
  nothing); `--apply` writes idempotently; `--pr` writes local PR artifacts under
  `~/.costguard/pr/`; `--open-pr` is gated and inert (no push — see §9).
- `digest` is a concise **monthly** summary (total `$/mo`, per-provider breakdown, top
  findings), distinct from the full `report`. It **defaults to printing to stdout**; `--out`
  writes a local file; `--last` renders the last saved run; `--post` is gated and inert,
  requiring `COSTGUARD_DIGEST_WEBHOOK` yet performing no network post (see §9).

Exit non-zero when any `high` finding exists (CI-gate friendly).

---

## 11. Reuse decisions

- **`actionlint`** for workflow correctness; Costguard adds the cost layer.
- No existing tool aggregates multi-provider billing + cron frequency → the orchestrator
  and provider modules are justified custom code.
- Provider SDKs where they are read-only and light; otherwise raw REST/GraphQL.
- Reject Infracost-style IaC cost modeling — wrong shape for "what am I already paying."

---

## 12. Reference "known-good" templates

web-app's current workflows, post-#65, are the baseline the CI rules diff against:

- `ci.yml` — `pull_request` only + `paths-ignore: ['**.md','docs/**']` + `concurrency`.
- `deploy-production.yml` / `deploy-staging.yml` — `push` + `paths-ignore` + `concurrency`.
- `rls.yml` — manual `workflow_dispatch` only, intentionally **not** wired to `pull_request`.

These ship as templates under `costguard/templates/` so rules cite a concrete target.

---

## 13. Phased roadmap

- **Phase 0 — this doc.** Approved before any code.
- **Phase 1 — Half A. Shipped.** Orchestrator + registry + CI rules + cron rules + reporter,
  zero credentials, across every workspace.
- **Phase 2 — Supabase + GitHub billing modules. Shipped.** The two real-leak providers,
  read-only, reconciled against the registry `active{}` allowlist.
- **Phase 3 — Railway / Netlify / Neon modules. Shipped.** Coverage rounded out; railway via
  read-only GraphQL queries, the rest via read-only HTTP GET.
- **Phase 4 — `fix` (in-repo only) + PR emission. Shipped.** Deterministic, autofixable CI
  rules only; dry-run by default, `--apply` writes, `--pr` emits local artifacts, `--open-pr`
  gated and inert (no push).
- **Phase 5 — monthly digest. Shipped.** Concise per-month summary (total $/mo, per-provider
  breakdown, top findings) printed/written locally; `--post` gated and inert (see §9), with an
  inert GitHub Actions scheduler template for opt-in monthly delivery (see §15).

---

## 14. Future: programmatic / library integration

Out of scope to build now; design so it is not painful later:

- Keep the orchestrator and checks as a **library** with a thin CLI shell, so a host
  application can call the same audit programmatically for the workspaces it manages.
- Registry (`workspaces.json`) is the integration seam — the host supplies the workspace
  list + `active` allowlist; Costguard returns `Finding[]`.
- No host-specific code in v1. Just don't bury logic inside the CLI layer.

---

## 15. Scheduler template (inert)

The monthly digest can be delivered on a cron via GitHub Actions, but Costguard ships the
wiring **inert** so nothing fires by accident.

- **Where it lives.** `templates/costguard-digest.yml` sits under `templates/`, deliberately
  **not** `.github/workflows/`. GitHub only runs workflows under `.github/workflows/`, so the
  template never executes while it stays in `templates/`. It is documented, not enabled.
- **Activation (human action).** Copy the template into `.github/workflows/` in the target
  repo and supply the required secrets (e.g. `COSTGUARD_DIGEST_WEBHOOK`). This is the moment
  the schedule becomes live, and it is performed by a human, never by the CLI.
- **Rollback.** Delete the copied file from `.github/workflows/`.
- **Review posture.** This project does **not** enable the schedule. Any change that actually
  wires real, recurring delivery — committing the workflow into `.github/workflows/`, enabling
  `digest --post`, or adding a live webhook — is **PENDING_REVIEW**: it is a harness/automation
  mutation that must be human-reviewed and is never counted as shipped green evidence here.

---

## 16. Open decisions (resolved at/after Phase 1)

1. **Stack** — TypeScript (matches the repos, shared types, easy PR-emit later) vs Python
   (lighter provider scripting). Lean: **TypeScript**.
2. **Cron threshold default** — 15 min (matches the #62 fix) or stricter?
3. **`estMonthlyUsd` for CI minutes** — derive from a configurable per-minute rate, or
   report raw minutes and let the report annotate cost?
4. **Registry bootstrap** — hand-write `workspaces.json`, or a `costguard init` that scans
   siblings and proposes a draft?
```
