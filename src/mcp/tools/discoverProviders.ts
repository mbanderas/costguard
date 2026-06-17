import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { detectProviders } from "../../discovery/detect.js";
import { discoverProvidersInputSchema } from "../schemas.js";

/**
 * discover_providers: wrap detectProviders. Output carries env-var NAMES only,
 * never values (R10 — guaranteed by reuse; detectProviders reads key names only).
 */
export function discoverProvidersHandler(args: unknown): CallToolResult {
  const { dir } = discoverProvidersInputSchema.parse(args);
  const detections = detectProviders(dir);
  const payload = { detections };
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
}
