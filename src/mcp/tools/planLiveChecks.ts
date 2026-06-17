import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { decideLiveStrategy } from "../live/decide.js";
import { CONSENT_NOTICE, liveConsentGranted } from "../live/consent.js";
import { playbookFor } from "../live/playbooks/index.js";
import { planLiveChecksInputSchema, type LiveCheckPlaybook } from "../schemas.js";

/**
 * plan_live_checks: build the per-provider playbook. costguard NEVER drives the
 * browser here — it only PLANS. The actionable browser snippet is emitted ONLY
 * for a browser-fallback provider that has a playbook AND only when the caller
 * passed explicit per-run consent (confirmLive:true). API-first providers never
 * get a snippet (prefer the API path via audit_workspace). The consentNotice is
 * always returned so the agent can surface it before any browsing.
 */
export function planLiveChecksHandler(args: unknown): CallToolResult {
  const { provider, confirmLive } = planLiveChecksInputSchema.parse(args);
  const { apiFirst } = decideLiveStrategy(provider, process.env);
  const planId = `${provider}-${Date.now().toString(36)}`;

  const snippet =
    !apiFirst && liveConsentGranted(confirmLive) ? playbookFor(provider) : undefined;

  const playbook: LiveCheckPlaybook = {
    planId,
    provider,
    apiFirst,
    consentNotice: CONSENT_NOTICE,
    ...(snippet !== undefined
      ? {
          billingUrl: snippet.billingUrl,
          readOnlySnippet: snippet.readOnlySnippet,
          parseSpec: snippet.parseSpec,
        }
      : {}),
  };

  return { content: [{ type: "text", text: JSON.stringify(playbook) }], structuredContent: playbook };
}
