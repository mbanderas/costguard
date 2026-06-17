// Live-mode consent (gate 2 of the defense-in-depth model in
// docs/mcp-architecture.md §5.3). plan_live_checks always returns this notice so
// the agent can surface it; the actionable browser snippet is withheld until the
// caller passes explicit per-run consent (confirmLive:true).

export const CONSENT_NOTICE = [
  "Live mode performs READ-ONLY browser navigation over your already-logged-in",
  "session, conducted by the playwriter MCP server — not by costguard. costguard",
  "never drives the browser, never submits forms or replays credentials, and never",
  "reads cookies, localStorage, sessionStorage, or screenshots — only rendered",
  "billing figures. It is opt-in and requires your explicit per-run confirmation",
  "(confirmLive:true) before any snippet is emitted.",
].join(" ");

/** Whether the caller granted explicit per-run consent for this live check. */
export function liveConsentGranted(confirmLive: boolean | undefined): boolean {
  return confirmLive === true;
}
