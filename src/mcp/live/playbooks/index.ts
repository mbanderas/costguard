import type { ParseSpec } from "../../schemas.js";

/**
 * A provider billing playbook: DATA only, no logic. `readOnlySnippet` is the
 * Playwright JS the agent runs via the playwriter MCP server; it MUST pass the
 * read-only invariant (no .fill/.click/.type/submit/cookies/localStorage/
 * sessionStorage/screenshot). `parseSpec` maps the returned reading to Finding
 * fields. Populated by P5 (one entry per provider that lacks a usable billing API).
 */
export interface Playbook {
  readonly billingUrl: string;
  readonly readOnlySnippet: string;
  readonly parseSpec: ParseSpec;
}

const PLAYBOOKS: Readonly<Record<string, Playbook>> = {};

/** Returns the playbook for a provider, or undefined (never throws) for unknown. */
export function playbookFor(provider: string): Playbook | undefined {
  return PLAYBOOKS[provider];
}
