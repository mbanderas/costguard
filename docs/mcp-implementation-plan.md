# costguard MCP — phased implementation plan

Companion to `docs/mcp-architecture.md`. Executes the HYBRID decision (D1).
Constraints enforced every phase: TypeScript strict, no `any` (use `unknown` +
narrow), files <400 LOC / functions <50 LOC, immutable patterns, conventional
commits, validate at boundaries only, **no npm publish without user
authorization**, no `console.log` in production. TDD: write the failing test
first. Gates per phase: `npx tsc --noEmit`, `npx eslint . --quiet`,
`pnpm test` (vitest). Max 5 files per phase (S7.1).

## Dependency map

```
P0 (deps+build+schemas)
  └─> P1 (server bootstrap + registry)
        ├─> P2 (read tools)        ─┐
        ├─> P3 (fix tools)          ├─ independent file sets; share tools/index.ts
        └─> P4 (live bridge core)  ─┘   (registry wired by a single integrator)
                                        └─> P5 (playbooks, data)
P0,P1 ──────────────────────────────────> P6 (plugin wiring + skill/docs)
P7 (npm publish) = USER-DECISION GATE — not autonomous, out of scope until authorized
```

Critical path: P0 -> P1 -> P4 -> P5. P2 and P3 can run in parallel with P4
after P1. P6 can start once P0+P1 land.

## Parallel groups (max 4 specialists)

- **Group G1 (after P1):** P2, P3, P4 in parallel — three specialists, disjoint
  file sets. The only shared file is `src/mcp/tools/index.ts` (the registry):
  use `isolation: "worktree"` per specialist, and a single integrator merges the
  three registry entries at group end (cross-talk check: each phase only ADDS
  one array entry — no interface changes). If worktree overhead is unwanted,
  run P2/P3/P4 sequentially; they are small.
- **Group G2 (after P4):** P5 playbooks — one specialist per provider playbook
  (data files, fully independent), max 4.
- All other phases are single-writer.

---

## P0 — deps, build target, schemas

**Files (≤5):**
1. `package.json` — add dep `@modelcontextprotocol/sdk`; add `bin`
   `"costguard-mcp": "./dist/mcp/server.js"`; add script `build:mcp`
   (esbuild bundling `src/mcp/server.ts` -> `dist/mcp/server.js`, ESM, node
   platform, shebang banner `#!/usr/bin/env node`).
2. build config (extend existing esbuild script/config for the new entry).
3. `src/mcp/schemas.ts` — zod schemas: `findingSchema` (mirrors `Finding`),
   `findingsResultSchema` (`FindingsResult` envelope incl. `totalMonthlyUsd`,
   `countsBySeverity`, `diagnostics`), input schemas for every tool, and the
   live types (`LiveCheckPlaybook`, `ParseSpec`, `LiveReading`). `ParseSpec`
   field `kind` is the closed union `"currency"|"number"|"label"` (rejects
   secret/token fields by construction).
4. `tsconfig`/`eslint` include adjustment for `src/mcp/**` if not already covered.
5. `src/mcp/__tests__/schemas.test.ts` — TDD.

**Dependencies:** none.
**Acceptance:** tsc + eslint clean; schema round-trips a sample `Finding`;
`findingsResultSchema` rejects a malformed finding; `ParseSpec` rejects a field
whose `kind` is outside the union; `pnpm build:mcp` emits `dist/mcp/server.js`
(may be a stub export at this phase).
**Test strategy:** unit — valid/invalid parse cases per schema; assert the
`ParseSpec.kind` union rejects `"token"`/`"cookie"`.

## P1 — MCP server bootstrap + tool registry

**Files (≤3):**
1. `src/mcp/server.ts` — instantiate `McpServer` from
   `@modelcontextprotocol/sdk`, connect `StdioServerTransport`, register tools
   from the registry, set concise server instructions (<2KB) describing
   categories so tool-search can find them. No `console.log` (use the SDK/stderr
   logging path only).
2. `src/mcp/tools/index.ts` — `tools` registry: array of
   `{ name, description, inputSchema, handler }`. Empty-but-typed at this phase.
3. `src/mcp/__tests__/server.test.ts` — TDD: connect an in-memory client/server
   pair, assert `tools/list` returns the registered set.

**Dependencies:** P0.
**Acceptance:** server lists registered tools over an in-memory transport;
graceful shutdown; tsc/eslint/vitest green; no `any`.
**Test strategy:** in-memory transport integration test (SDK provides a linked
pair); assert tool count + names.

## P2 — read tools

**Files (≤4):**
1. `src/mcp/tools/auditWorkspace.ts` — validate input -> build `selection` via
   the existing `resolveSelection` -> `runAudit({ selection, config, flags }):
   Promise<Finding[]>` (the PURE orchestrator, orchestrator.ts:96) -> shape
   `FindingsResult`, computing `totalMonthlyUsd` by reusing the exported
   `totalMonthlyUsd(findings)` helper (orchestrator.ts:172). MUST NOT call
   `runAuditAndReport` (audit.ts:19) — it is a CLI presenter
   (`console.log`/`process.exitCode`) and is forbidden in `src/mcp/`.
2. `src/mcp/tools/discoverProviders.ts` -> `detectProviders` ->
   `{ detections }` (env-var NAMES only — guaranteed by reuse; add a test that
   asserts no value-like strings leak).
3. `src/mcp/tools/auditSite.ts` -> `collectSiteFindings` -> `FindingsResult`.
4. `src/mcp/__tests__/readTools.test.ts`.

**Dependencies:** P1. **Parallel:** G1.
**Acceptance:** each tool wraps exactly one engine fn (no engine logic in the
adapter — reviewer greps `src/mcp/` for rule/pricing logic and finds none); a
grep of `src/mcp/` for `runAuditAndReport` and `console.` returns ZERO matches
(adapters call pure engine fns only, never CLI presenters);
`discover_providers` output contains no env-var VALUES; `totalMonthlyUsd`
counts COST findings only (adapter filters `kind !== "diagnostic"` then reuses
the `totalMonthlyUsd` helper — a test asserts a diagnostic finding with nonzero
`estMonthlyUsd` is excluded from the envelope total); tsc/eslint/vitest green.
**Test strategy:** mock the engine fn, assert the adapter shapes output and
computes `totalMonthlyUsd` = sum of non-diagnostic findings.

## P3 — fix tools

**Files (≤3):**
1. `src/mcp/tools/planFix.ts` -> `runFixEngine({ apply: false })` ->
   `{ results }` (diffs only, no writes).
2. `src/mcp/tools/applyFix.ts` -> `runFixEngine({ apply: true })`; handler
   REFUSES unless `confirmApply === true`; only the three gated rules; never
   pushes git; never touches provider accounts.
3. `src/mcp/__tests__/fixTools.test.ts`.

**Dependencies:** P1. **Parallel:** G1.
**Acceptance:** `plan_fix` writes nothing (assert fs untouched); `apply_fix`
throws/rejects a structured error when `confirmApply` absent; with it, applies
only gated rules and is idempotent on re-run; tsc/eslint/vitest green.
**Test strategy:** temp-dir fixture; assert no write on plan; assert refusal
without confirm; assert idempotency (second apply = no-op diff).

## P4 — live bridge core

**Files (≤5):**
1. `src/mcp/live/decide.ts` — `decideLiveStrategy(provider, env)`: API-first iff a
   provider module exists AND `providerModule.resolveToken(env) !== undefined`
   (deterministic env-NAME check, NO network probe); else browser-fallback.
   Matches `docs/mcp-architecture.md` §4.3 verbatim.
2. `src/mcp/live/consent.ts` — consent gate (requires explicit per-run
   confirmation) + `consentNotice` text; the posture-extension wording.
3. `src/mcp/tools/planLiveChecks.ts` -> `LiveCheckPlaybook` (uses decide +
   consent + playbook lookup).
4. `src/mcp/tools/ingestLiveReading.ts` -> reconcile to `Finding`, else
   `kind:"diagnostic"` (graceful) when unparseable; reuse provider `reconcile*`
   where the shape allows.
5. `src/mcp/__tests__/liveBridge.test.ts`.

**Dependencies:** P1, P0 schemas.
**Acceptance (security-critical):** provider WITH usable API -> `apiFirst:true`,
no `readOnlySnippet`; provider WITHOUT -> a snippet that the test asserts
contains NO `.fill(`, `.click(`, `.type(`, `submit`, `cookies`, `localStorage`,
`sessionStorage`, `screenshot`, or `evaluate` of token-bearing names (read-only
invariant oracle); `ingest_live_reading` returns `kind:"diagnostic"` on
unparseable input and never fabricates a number; consent refused -> tool returns
a consent-required error, not a snippet. tsc/eslint/vitest green.
**Test strategy:** table-driven: API vs no-API provider; snippet read-only
invariant (forbidden-substring oracle — do NOT weaken this assertion to pass);
ingest happy-path + unparseable -> diagnostic.

## P5 — provider playbooks (data)

**Files (≤5):**
1. `src/mcp/live/playbooks/index.ts` — `playbookFor(provider)` lookup.
2-4. `src/mcp/live/playbooks/<provider>.ts` — FIRST-CUT SET = providers that
   LACK a usable billing API (chosen from the verified list during execution; no
   speculative providers). Each exports `{ billingUrl, readOnlySnippet,
   parseSpec }` — data, not logic.
5. `src/mcp/__tests__/playbooks.test.ts`.

**Dependencies:** P4. **Parallel:** G2 (one specialist per playbook).
**Acceptance:** every playbook snippet passes the read-only invariant oracle
from P4; every `parseSpec` uses only `currency|number|label` fields; lookup
returns undefined (not throw) for unknown providers; tsc/eslint/vitest green.
**Test strategy:** loop all playbooks through the shared read-only invariant
assertion; assert `monthlyUsdField` exists in `fields`.

## P6 — plugin wiring + skill/docs (PROTECTED SURFACE)

**Files (≤5):**
1. `.claude-plugin/.mcp.json` — declare bundled stdio server
   `{ "mcpServers": { "costguard": { "command": "node", "args":
   ["${CLAUDE_PLUGIN_ROOT}/dist/mcp/server.js"] } } }`.
2. `skills/costguard/SKILL.md` — add an explicit `--live` section: posture
   EXTENSION (browser reads over the user's logged-in session via playwriter,
   agent-conducted), the 3 consent gates, API-first/browser-fallback rule, and
   graceful-degrade behavior. Keep all existing read-only posture language.
3. slash commands (`/costguard-audit`, `/costguard-fix`, optionally a new
   `/costguard-live`) — reference the MCP tools + consent flow.
4. `.codex-plugin/` note + `README`/docs pointer to `~/.codex/config.toml`
   `[mcp_servers.costguard]` form.
5. (doc) cross-link from `docs/mcp-architecture.md`.

**Dependencies:** P0 (bin/build path), P1 (server exists).
**Acceptance:** `.mcp.json` validates and points at the bundled build (no `npx`,
no published package); SKILL.md documents the posture extension + consent;
existing guarantees unchanged. **This phase touches instructions/manifests =
protected surface -> report PENDING_REVIEW (human sign-off on the posture
wording).**
**Test strategy:** JSON schema/lint of `.mcp.json`; manual review of SKILL.md
posture wording (human gate).

## P7 — npm publish (USER-DECISION GATE)

NOT an autonomous step. Publishing `costguard-mcp` to npm for an
`npx costguard-mcp` distribution path requires explicit user authorization
(memory: no npm publish without authorization). The bundled-plugin path (P6)
ships the server with zero publish, so this phase is OPTIONAL and deferred until
the user decides. The execution loop must STOP and ask, never publish.

---

## Verification summary (every phase)

- TDD: failing test committed first.
- Gates: `npx tsc --noEmit` && `npx eslint . --quiet` && `pnpm test` all green
  before the phase is "done".
- One conventional commit per completed phase on the feature branch
  (`feat: …` / `test: …`); never push; never publish.
- Status token per phase: VERIFIED (gates pass) | PENDING_REVIEW (P6 — protected
  surface/posture) | FAIL (gate red — fix the defect, never weaken a test,
  especially the live read-only invariant oracle).
- Security oracle (P4/P5 read-only invariant) is load-bearing: a failing
  invariant means fix the snippet, not the assertion.
