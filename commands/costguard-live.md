---
description: Plan and ingest an opt-in, consent-gated live billing check for a provider, conducted via the playwriter MCP server (read-only browser reads over your logged-in session). costguard never drives the browser itself.
argument-hint: "<provider> [--confirm]"
allowed-tools: Bash, Read
---

Run a Costguard **live billing check** for a provider. Requested: `$ARGUMENTS`

Live mode is **opt-in and consent-gated**. costguard only PLANS the read (it emits
a read-only snippet) and INGESTS the result; the browser action is performed by
the **playwriter** MCP server, authorized by the user. costguard never drives the
browser, never submits forms or credentials, and never reads cookies, storage, or
screenshots — only rendered billing figures.

Steps (via the costguard MCP server's tools):

1. Call `plan_live_checks` with the provider (no `confirmLive` yet). Surface the
   returned `consentNotice` to the user and report the `apiFirst` decision.
   - If `apiFirst` is true, STOP and prefer `/costguard-audit <ws> --providers
     <provider>` (the API path) — no browser is needed.
2. Only after the user explicitly agrees (e.g. they passed `--confirm`), call
   `plan_live_checks` again with `confirmLive:true` to obtain the read-only
   `readOnlySnippet` + `billingUrl` + `parseSpec`.
3. Ask the playwriter MCP server to `execute` that snippet over the user's
   logged-in session (this is playwriter's own consent gate). It returns the
   rendered figures.
4. Call `ingest_live_reading` with the provider and the returned `values` to get a
   Finding. If playwriter is unavailable or the figure is unparseable, ingest
   returns a `kind:"diagnostic"` Finding (excluded from cost totals) — the audit
   never blocks.

Notes:

- Three consent gates apply: host MCP consent, costguard's `confirmLive:true`,
  and playwriter's own consent before `execute`.
- A provider with a resolvable API token is API-first — browser is the fallback,
  never the primary path.
- This command needs the costguard MCP server (declared in
  `.claude-plugin/.mcp.json`) and the playwriter MCP server both connected.
