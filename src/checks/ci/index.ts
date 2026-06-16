import fs from "node:fs";
import path from "node:path";
import type { Check, CheckContext, Finding } from "../../types.js";
import { parseWorkflow } from "./parser.js";
import {
  checkDoubleTrigger,
  checkNoPathsIgnore,
  checkNoConcurrency,
  checkNoTimeout,
  checkJobFanout,
  checkMatrixOverkill,
  checkScheduleFrequency,
} from "./rules.js";
import { runActionlint } from "./actionlint.js";

function globWorkflows(workspaceDir: string): string[] {
  const workflowsDir = path.join(workspaceDir, ".github", "workflows");
  if (!fs.existsSync(workflowsDir)) return [];

  try {
    const entries = fs.readdirSync(workflowsDir);
    return entries
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => path.join(workflowsDir, f));
  } catch {
    return [];
  }
}

function runRules(filePath: string, ctx: CheckContext): Finding[] {
  try {
    const model = parseWorkflow(filePath);
    return [
      ...checkDoubleTrigger(model, ctx),
      ...checkNoPathsIgnore(model, ctx),
      ...checkNoConcurrency(model, ctx),
      ...checkNoTimeout(model, ctx),
      ...checkJobFanout(model, ctx),
      ...checkMatrixOverkill(model, ctx),
      ...checkScheduleFrequency(model, ctx),
    ];
  } catch {
    return [];
  }
}

export const ciCheck: Check = async (ctx: CheckContext): Promise<Finding[]> => {
  const workflowFiles = globWorkflows(ctx.workspaceDir);
  if (workflowFiles.length === 0) return [];

  const findings: Finding[] = [];

  for (const filePath of workflowFiles) {
    const ruleFindings = runRules(filePath, ctx);
    findings.push(...ruleFindings);
  }

  const actionlintFindings = await runActionlint(ctx.workspaceDir, ctx.workspace);
  findings.push(...actionlintFindings);

  return findings;
};
