import type { ParseSpec } from "../../schemas.js";
import { vercelPlaybook } from "./vercel.js";
import { renderPlaybook } from "./render.js";

/**
 * A provider billing playbook: DATA only, no logic. `readOnlySnippet` is the
 * Playwright JS the agent runs via the playwriter MCP server; it MUST pass the
 * read-only invariant (no .fill/.click/.type/submit/cookie/localStorage/
 * sessionStorage/screenshot). `parseSpec` maps the returned reading to Finding
 * fields. First-cut set: providers whose actual billed figure is dashboard-only.
 */
export interface Playbook {
  readonly billingUrl: string;
  readonly readOnlySnippet: string;
  readonly parseSpec: ParseSpec;
}

const PLAYBOOKS: Readonly<Record<string, Playbook>> = {
  vercel: vercelPlaybook,
  render: renderPlaybook,
};

/** Returns the playbook for a provider, or undefined (never throws) for unknown. */
export function playbookFor(provider: string): Playbook | undefined {
  return PLAYBOOKS[provider];
}

/** All registered playbooks as [provider, playbook] pairs (for invariant tests). */
export function allPlaybooks(): ReadonlyArray<readonly [string, Playbook]> {
  return Object.entries(PLAYBOOKS);
}
