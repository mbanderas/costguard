/**
 * Cron frequency check entry point.
 *
 * Scans Inngest, vercel.json, Supabase pg_cron SQL, and node-cron sources.
 * Does NOT scan .github/workflows — GitHub Actions schedule cost is owned
 * by the CI module (rule ci/schedule-frequency).
 */

import type { Check } from "../../types.js";
import { findCronHits } from "./parser.js";
import { applyRules } from "./rules.js";

export const cronCheck: Check = async (ctx) => {
  const hits = await findCronHits(ctx.workspaceDir);
  return applyRules(hits, ctx);
};
