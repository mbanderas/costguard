import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { collectSiteFindings } from "../../checks/site/auditSite.js";
import { auditSiteInputSchema } from "../schemas.js";
import { buildFindingsResult } from "./auditWorkspace.js";

/**
 * audit_site: wrap collectSiteFindings (GET-only, read-only — no browser, no form
 * submit, no credential replay). Each URL becomes a labelled site target; the
 * result reuses the shared findings envelope.
 */
export async function auditSiteHandler(args: unknown): Promise<CallToolResult> {
  const { urls } = auditSiteInputSchema.parse(args);
  const targets = urls.map((url, i) => ({ workspace: `url-${i}`, site: url }));
  const findings = await collectSiteFindings(targets);
  const result = buildFindingsResult(findings);
  return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
}
