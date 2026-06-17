# costguard surface architecture — MCP + plugin/skill + live billing checks

Status: DESIGN (no production code yet). Decision source:
`_costguard-mcp-design.md` (D1). This document specifies the chosen shape.

## 1. Decision (summary)

**HYBRID.** One engine, three surfaces:

- **CLI** — humans + CI (unchanged; existing 387-test surface preserved).
- **MCP server** — host-agnostic structured capability surface for AI coding
  agents (Claude Code, Codex, any MCP host). Wraps existing engine functions;
  never reimplements them.
- **Thin plugin/skill** — Claude Code + Codex UX: slash commands, guidance,
  `--live` consent flow, and an MCP-server reference.

The MCP server ships **bundled inside the existing plugin** and is launched as a
local stdio process from the plugin build (`${CLAUDE_PLUGIN_ROOT}/dist/mcp/server.js`).
**No npm publish is required** to distribute it; publishing to npm for an
`npx costguard-mcp` distribution path remains an explicit, separate
USER-DECISION gate.

Rationale, axis scoring, trade-offs, and rejected alternatives (A: MCP-only,
B: plugin-only) live in the checkpoint `_costguard-mcp-design.md` (D1).

## 2. One engine, one source of truth

The engine is unchanged. Both the CLI and the MCP adapters call the SAME
exported functions. The MCP server is "just another caller", exactly like the
CLI is today.

```
            ┌──────────── engine (unchanged) ────────────┐
            │  src/checks/ci   src/checks/site            │
            │  src/providers/<name>  src/fix/engine        │
            │  src/discovery/signals   src/orchestrator    │
            └──────────────────────────────────────────────┘
                 ▲                              ▲
                 │ imports                      │ imports
        ┌────────┴────────┐            ┌────────┴─────────┐
        │  src/cli/        │            │  src/mcp/        │   (NEW — thin)
        │  commands/*      │            │  tools/* adapters│
        └─────────────────┘            └──────────────────┘
                 ▲                              ▲
          bin: costguard               bin: costguard-mcp (stdio)
                                              ▲
                                  ┌───────────┴────────────┐
                                  │ plugin .mcp.json declares │
                                  │ the bundled MCP server     │
                                  │ + slash commands + SKILL.md│
                                  └────────────────────────────┘
```

Hard rule (audit-checkable): **nothing under `src/mcp/` contains engine logic.**
Each adapter validates input, calls one existing engine function, and shapes the
result. If an adapter needs logic the engine does not expose, the fix is to add/
export it in the engine, not to duplicate it in the adapter.

## 3. File layout (NEW code only)

```
src/mcp/
  server.ts              # bootstrap: @modelcontextprotocol/sdk McpServer,
                         #   stdio transport, register tools, server instructions
  tools/
    index.ts             # tool registry (array of {schema, handler})
    auditWorkspace.ts    # -> resolveSelection + runAudit (orchestrator.ts)
    discoverProviders.ts # -> detectProviders
    auditSite.ts         # -> collectSiteFindings / analyzeSite
    planFix.ts           # -> runFixEngine({ apply: false })  (dry-run)
    applyFix.ts          # -> runFixEngine({ apply: true })   (consent-gated)
    planLiveChecks.ts    # playwriter bridge: planner (no browser here)
    ingestLiveReading.ts # playwriter bridge: ingest -> reconciled Finding
  schemas.ts             # zod input/output schemas; re-exports Finding shape
  live/
    decide.ts            # API-first vs browser-fallback decision rule
    consent.ts           # live-mode consent gate + posture notice text
    playbooks/
      index.ts           # provider -> playbook lookup
      <provider>.ts      # DATA only: billingUrl, readOnlySnippet, parseSpec
```

LOC discipline: `server.ts` and each adapter target <50 LOC bodies, <400 LOC
files (project rule). Playbooks are data, not logic.

Build: add an esbuild target `dist/mcp/server.js` (esbuild already present).
`package.json` gains `"costguard-mcp": "./dist/mcp/server.js"` in `bin`.
Dependency added: `@modelcontextprotocol/sdk` (the only new runtime dep).

## 4. MCP tool surface

All tools return the existing `Finding` shape verbatim (no parallel type). Input
is validated with zod at the boundary (engine functions stay
validation-light internally — project rule: validate at system boundaries only).

`Finding` (reused, from `src/types.ts`):

```ts
interface Finding {
  workspace: string;
  provider: string;
  rule: string;
  severity: "info" | "warn" | "high";
  estMonthlyUsd: number;
  title: string;
  detail: string;
  fix: string;
  autofixable: boolean;
  kind?: "cost" | "diagnostic";
}
```

Shared output envelope (so totals are computed once, consistently):

```ts
interface FindingsResult {
  findings: Finding[];                 // cost + diagnostic, in order
  totalMonthlyUsd: number;             // total over COST findings only
  countsBySeverity: { info: number; warn: number; high: number };
  diagnostics: number;                 // count of kind==="diagnostic"
}
```

Note on totals: the engine helper `totalMonthlyUsd(findings)` (orchestrator.ts:172)
sums whatever array it is given — it does NOT itself filter by `kind`. The
cost-only total is produced the SAME way the existing reporter/digest do it: the
caller first filters to cost findings (`findings.filter(f => f.kind !==
"diagnostic")`) and passes that subset. The `audit_workspace` adapter follows
this convention exactly (reuse, not a re-implemented sum).

### 4.1 Read tools (preserve read-only/local posture exactly)

| Tool | Wraps | Input (zod) | Output |
|---|---|---|---|
| `audit_workspace` | `resolveSelection` + `runAudit` (orchestrator.ts) | `{ workspaces?: string[]; all?: boolean; includeSite?: boolean }` | `FindingsResult` |
| `discover_providers` | `detectProviders` | `{ dir: string }` | `{ detections: Detection[] }` |
| `audit_site` | `collectSiteFindings` | `{ urls: string[] }` | `FindingsResult` |

The adapter calls the PURE engine orchestrator `runAudit({ selection, config,
flags }): Promise<Finding[]>` (orchestrator.ts:96) — NOT the CLI presenter
`runAuditAndReport` (audit.ts:19), which performs `console.log` / sets
`process.exitCode` and must never be reachable from `src/mcp/`. It builds
`selection: SelectedWorkspace[]` via the existing `resolveSelection`, then
computes `totalMonthlyUsd` for the envelope by filtering to cost findings and
reusing the exported `totalMonthlyUsd(findings)` helper (orchestrator.ts:172) —
the reporter/digest convention — never a re-implemented sum.

`Detection` is the existing discovery type: `{ id, configFiles[], depPackages[],
envVars[] }` — env-var NAMES only, never values (R10 preserved by reuse).

### 4.2 Fix tools (local-file writes; dry-run default preserved)

| Tool | Wraps | Input | Output | Posture |
|---|---|---|---|---|
| `plan_fix` | `runFixEngine({apply:false})` | `{ findings: Finding[]; workspaceDir: string }` | `{ results: EngineResult[] }` | read-only; returns diffs only |
| `apply_fix` | `runFixEngine({apply:true})` | `{ findings: Finding[]; workspaceDir: string; confirmApply: true }` | `{ results: EngineResult[]; writtenFiles: string[] }` | writes local files; gated |

`apply_fix` preserves every existing safeguard: only the three deterministic
gated rules (`ci/no-paths-ignore`, `ci/no-concurrency`, `ci/no-timeout`),
idempotent, never pushes git, never touches provider accounts. The new MCP-level
guard: the handler refuses unless `confirmApply === true` is present in the
input — the agent must pass explicit confirmation, mirroring the CLI's
`--apply` opt-in. Default path is `plan_fix` (diffs only).

### 4.3 playwriter bridge (live billing checks)

No server-to-server calls (FACT 1). The agent is the conductor: it calls a
costguard tool to get a plan, runs the browser step via the **playwriter** MCP
server, then calls a costguard tool to ingest the result.

```ts
interface LiveCheckPlaybook {
  planId: string;                 // opaque id echoed back to ingest_live_reading
  provider: string;
  apiFirst: boolean;              // true => use API path, browser NOT needed
  billingUrl?: string;           // present only when apiFirst === false
  readOnlySnippet?: string;      // Playwright JS for playwriter `execute`
  parseSpec?: ParseSpec;         // how ingest maps the reading -> Finding fields
  consentNotice: string;          // MUST be surfaced to the user before browsing
}

interface ParseSpec {
  // declarative field map; NO secret-bearing fields permitted
  fields: { name: string; selectorHint: string; kind: "currency" | "number" | "label" }[];
  monthlyUsdField: string;        // which field becomes estMonthlyUsd
}

interface LiveReading {
  planId: string;
  // structured key->value pairs the snippet returned; freeform tolerated
  values: Record<string, string | number>;
  raw?: string;                   // optional freeform fallback text
}
```

| Tool | Purpose | Input | Output |
|---|---|---|---|
| `plan_live_checks` | build the per-provider playbook | `{ provider: string; workspaceDir?: string }` | `LiveCheckPlaybook` |
| `ingest_live_reading` | reconcile what the browser returned | `{ provider: string; reading: LiveReading }` | `{ finding: Finding }` |

`ingest_live_reading` reuses the provider's existing `reconcile*` logic where the
shape allows; when the reading cannot be parsed into a numeric figure it returns
a `kind:"diagnostic"` Finding (excluded from totals) rather than guessing.

#### API-first / browser-fallback decision rule (`live/decide.ts`)

```
plan_live_checks(provider):
  if providerModule(provider) exists AND its API token is resolvable from env
     (providerModule.resolveToken(env) !== undefined — env-NAME check, no
      network probe):
      return { apiFirst: true, consentNotice, planId }   # no browser
      # caller should prefer audit_workspace (API path) for this provider
  else (no provider module, or token not resolvable, or figure is dashboard-only):
      return { apiFirst: false, billingUrl, readOnlySnippet, parseSpec,
               consentNotice, planId }
```

The condition is a deterministic, network-free token-resolvability check (reusing
`ProviderModule.resolveToken`), NOT a live reachability probe — `plan_live_checks`
stays cheap and side-effect-free; the actual API call happens later in
`audit_workspace`. Browser is the FALLBACK, never the primary path. A provider
with a resolvable API token never produces a `readOnlySnippet`. This matches the
PLAN's P4 `decide.ts` definition exactly.

## 5. `--live` security & consent design (LOAD-BEARING)

### 5.1 Posture change — stated explicitly, not silent

Existing guarantee (plugin.json + SKILL.md): read-only, local, never writes
provider accounts, never pushes git, never prints secrets; site checks do "no
browser, no form submit, no credential replay."

`--live` **extends** that posture: it introduces **browser-driven reads over the
user's already-logged-in session**, performed by the **playwriter** MCP server
under the agent's orchestration. This is a genuine change and is treated as one:
opt-in, off by default, and consent-gated. costguard's own MCP tools still never
drive a browser and never see credentials — they only PLAN (emit a read-only
snippet) and INGEST (parse returned figures). The browser action is performed by
playwriter, authorized by the user.

### 5.2 Enforced boundaries (encoded in the snippet contract)

The `readOnlySnippet` costguard emits is constrained to:

- **Read-only navigation only**: `page.goto(billingUrl)` + read rendered
  figures. No `.fill()`, no `.click()` on auth/submit controls, no form
  submission, no credential replay (costguard never sends credentials; it relies
  solely on the session already present in the user's browser).
- **No secret capture**: never read or return cookies, `localStorage`,
  `sessionStorage`, auth tokens, or full-page/secret-bearing screenshots.
  `parseSpec` extracts only numeric billing figures and their labels; a field of
  `kind:"label"|"currency"|"number"` only — token-like fields are rejected by
  schema.
- **Local-only**: the reading stays in the agent session and is handed straight
  to `ingest_live_reading`. costguard never transmits it anywhere.

### 5.3 Consent (defense in depth)

Three independent gates, all required:

1. **Host MCP consent** — the host obtains user consent before any tool call
   (MCP spec, Tool Safety). Project-scoped `.mcp.json` servers also require an
   approval prompt.
2. **costguard explicit consent** — the live tools refuse unless the caller
   passes an explicit per-run confirmation (`plan_live_checks` returns a
   `consentNotice` the agent MUST surface; the actual browsing only proceeds
   after the user agrees). `--live` is off by default in the CLI/skill.
3. **playwriter's own consent** — the browser action runs in playwriter, itself
   subject to host consent before `execute`.

### 5.4 Graceful degrade (playwriter absent)

If playwriter is not installed/connected, the agent cannot run the snippet.
costguard then emits a `kind:"diagnostic"` Finding —
`"live check unavailable: playwriter MCP not connected; reported API/static
result only"` — which is excluded from cost totals and counts. The audit never
fails or blocks on a missing browser. This reuses the existing graceful-degrade
channel (`kind:"diagnostic"`), so the contract is already proven.

## 6. Coexistence & packaging

- **CLI**: unchanged. `costguard audit|fix|site|discover|...` keep working.
- **MCP**: `package.json` `bin` gains `costguard-mcp`; esbuild emits
  `dist/mcp/server.js`.
- **Plugin**: add `.claude-plugin/.mcp.json` (and the Codex equivalent in
  `~/.codex/config.toml` form documented in SKILL.md):

  ```json
  {
    "mcpServers": {
      "costguard": {
        "command": "node",
        "args": ["${CLAUDE_PLUGIN_ROOT}/dist/mcp/server.js"]
      }
    }
  }
  ```

  No `npx`, no published package — the server runs from the bundled build.
- **SKILL.md / slash commands**: updated to (a) reference the MCP tools,
  (b) document the `--live` consent flow and posture extension, (c) state the
  API-first/browser-fallback rule. Existing read-only posture language stays;
  the `--live` extension is added as an explicit, gated section.
- **Plugin duplication**: the `.claude-plugin` / `.codex-plugin` split can be
  reduced over time by pointing both hosts at the one bundled MCP server (future
  cleanup, not required for the first cut).

## 7. Open items carried into PLAN

- Whether `apply_fix` belongs in the first MCP cut or is deferred (read tools +
  live bridge first). PLAN sequences this.
- Exact provider set that gets a `playbooks/<provider>.ts` in the first cut
  (start with providers lacking a usable billing API; do not speculate).
- `npx costguard-mcp` publish path is explicitly OUT of scope until the user
  authorizes an npm publish.

## 8. Implementation status & notes

Implemented across phases P0–P6 (see `docs/mcp-implementation-plan.md`). The
bundled server lives at `dist/mcp/server.js` and is declared for Claude Code in
`.claude-plugin/.mcp.json`; Codex uses the `[mcp_servers.costguard]` form
documented in `skills/costguard/SKILL.md`. Notable deviations from this design,
all surfaced rather than silent:

- **Consent shape (§5.3 gate 2).** `plan_live_checks` does not throw on missing
  consent; it returns the `consentNotice` + the API-first decision but WITHOLDS
  the `readOnlySnippet` until called with `confirmLive:true`. This preserves the
  surfacing flow (the agent must show the notice before browsing) while still
  ensuring "consent refused → no snippet".
- **Read-only oracle (§5.2).** The forbidden-token list uses the singular
  `"cookie"` instead of `"cookies"` so it also catches `document.cookie`. This
  strengthens the invariant (a superset match); it never weakens it.
- **First-cut playbooks.** P5 ships `vercel` and `render` only (real, stable
  dashboard billing URLs); no speculative providers.
