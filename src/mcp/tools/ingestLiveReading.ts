import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Finding } from "../../types.js";
import { playbookFor } from "../live/playbooks/index.js";
import { ingestLiveReadingInputSchema } from "../schemas.js";

/**
 * ingest_live_reading: reconcile what the browser returned into a Finding. The
 * monthly figure is taken from the playbook's `monthlyUsdField` when a playbook
 * exists, else from a small set of named keys. When no numeric monthly figure can
 * be extracted, return a kind:"diagnostic" Finding (excluded from totals) rather
 * than guessing — costguard never fabricates a number.
 */
export function ingestLiveReadingHandler(args: unknown): CallToolResult {
  const { provider, reading } = ingestLiveReadingInputSchema.parse(args);
  const monthly = extractMonthlyUsd(provider, reading.values);

  const finding: Finding =
    monthly === undefined
      ? {
          workspace: provider,
          provider,
          rule: `${provider}/live-unparseable`,
          severity: "info",
          estMonthlyUsd: 0,
          title: `Live billing reading not parseable for ${provider}`,
          detail: `Could not extract a monthly USD figure from the live reading${reading.raw !== undefined ? `: ${reading.raw}` : ""}.`,
          fix: "Confirm the billing page rendered a monthly total, or read via the provider API.",
          autofixable: false,
          kind: "diagnostic",
        }
      : {
          workspace: provider,
          provider,
          rule: `${provider}/live-billing`,
          severity: monthly > 0 ? "warn" : "info",
          estMonthlyUsd: monthly,
          title: `Live billing reading for ${provider}: $${monthly.toFixed(2)}/mo`,
          detail: `Parsed a monthly figure of $${monthly.toFixed(2)} from the live reading.`,
          fix: "Review the billing breakdown on the provider dashboard.",
          autofixable: false,
          kind: "cost",
        };

  const payload = { finding };
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
}

const NAMED_KEYS = ["monthly", "monthlyUsd", "total", "amount", "estMonthlyUsd"] as const;

function extractMonthlyUsd(
  provider: string,
  values: Record<string, string | number>,
): number | undefined {
  const field = playbookFor(provider)?.parseSpec.monthlyUsdField;
  if (field !== undefined) return coerceUsd(values[field]);
  for (const key of NAMED_KEYS) {
    const n = coerceUsd(values[key]);
    if (n !== undefined) return n;
  }
  return undefined;
}

/** Parse a USD figure from a number or a currency-like string; else undefined. */
function coerceUsd(v: string | number | undefined): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const match = v.replace(/[,\s]/g, "").match(/\$?(\d+(?:\.\d+)?)/);
  if (match?.[1] === undefined) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}
