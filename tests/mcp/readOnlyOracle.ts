// Load-bearing security oracle (shared by P4 liveBridge.test and P5 playbooks.test).
// Every browser snippet costguard emits — and every playbook's readOnlySnippet —
// MUST contain NONE of these tokens. A failing check means fix the SNIPPET, never
// weaken this list. Source: docs/mcp-architecture.md §5.2 + NON-NEGOTIABLE invariants.
export const FORBIDDEN_SNIPPET_TOKENS = [
  ".fill(",
  ".click(",
  ".type(",
  "submit",
  // Singular "cookie" (stronger than the spec's "cookies") so it also catches
  // `document.cookie`. Strengthening the oracle is allowed; weakening is not.
  "cookie",
  "localStorage",
  "sessionStorage",
  "screenshot",
] as const;

/** Returns the forbidden tokens present in a snippet (empty array => read-only). */
export function readOnlyViolations(snippet: string): string[] {
  return FORBIDDEN_SNIPPET_TOKENS.filter((token) => snippet.includes(token));
}
