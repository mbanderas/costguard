import fs from "node:fs";
import path from "node:path";
import type { Finding } from "../types.js";
import type { EngineResult } from "./types.js";
import { FIXER_REGISTRY } from "./registry.js";
import { buildDiff } from "./diff.js";

const RULE_ORDER = [
  "ci/no-paths-ignore",
  "ci/no-concurrency",
  "ci/no-timeout",
] as const;

export function runFixEngine(args: {
  findings: readonly Finding[];
  workspaceDir: string;
  apply: boolean;
}): EngineResult[] {
  const { findings, workspaceDir, apply } = args;

  const workflowsDir = path.join(workspaceDir, ".github", "workflows");
  if (!fs.existsSync(workflowsDir)) {
    return [];
  }

  const fixable = findings.filter(
    (f) =>
      f.provider === "ci" &&
      f.autofixable === true &&
      FIXER_REGISTRY[f.rule] !== undefined,
  );

  if (fixable.length === 0) {
    return [];
  }

  // Build map: basename -> set of ruleIds
  const basenameRules = new Map<string, Set<string>>();
  for (const f of fixable) {
    const basename = f.detail.split(":")[0]?.split("#")[0]?.trim() ?? "";
    if (basename === "") continue;
    const existing = basenameRules.get(basename);
    if (existing !== undefined) {
      existing.add(f.rule);
    } else {
      basenameRules.set(basename, new Set([f.rule]));
    }
  }

  const dirEntries = fs.readdirSync(workflowsDir);
  const results: EngineResult[] = [];

  for (const entry of dirEntries) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;

    const ruleSet = basenameRules.get(entry);
    if (ruleSet === undefined) continue;

    const filePath = path.join(workflowsDir, entry);
    const original = fs.readFileSync(filePath, "utf8");
    let content = original;
    const applied: string[] = [];

    for (const ruleId of RULE_ORDER) {
      if (!ruleSet.has(ruleId)) continue;
      const fixer = FIXER_REGISTRY[ruleId];
      if (fixer === undefined) continue;
      const r = fixer(filePath, content);
      if (r.changed) {
        content = r.patched;
        applied.push(ruleId);
      }
    }

    if (applied.length > 0) {
      const unifiedDiff = buildDiff(filePath, original, content);
      results.push({ filePath, original, patched: content, unifiedDiff, appliedRules: applied });
      if (apply) {
        fs.writeFileSync(filePath, content, "utf8");
      }
    }
  }

  return results;
}
