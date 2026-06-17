import { parseDocument, isMap, isSeq, isScalar } from "yaml";
import type { Fixer } from "../types.js";

const DEPLOY_SIGNAL_RE =
  /\b(helm|rollout|terraform apply|docker build|deploy)\b/i;

function collectRunStrings(jobValue: ReturnType<typeof parseDocument.prototype.get>): string[] {
  if (!isMap(jobValue)) return [];
  const stepsNode = jobValue.get("steps", true);
  if (!isSeq(stepsNode)) return [];
  const runs: string[] = [];
  for (const step of stepsNode.items) {
    if (!isMap(step)) continue;
    const runNode = step.get("run", true);
    if (isScalar(runNode) && typeof runNode.value === "string") {
      runs.push(runNode.value);
    }
  }
  return runs;
}

function chooseTimeout(runStrings: string[]): number {
  return runStrings.some((s) => DEPLOY_SIGNAL_RE.test(s)) ? 60 : 15;
}

export const timeoutFixer: Fixer = (filePath, content) => {
  const doc = parseDocument(content);
  const jobsNode = doc.get("jobs", true);

  if (!isMap(jobsNode)) {
    return { filePath, original: content, patched: content, changed: false };
  }

  let changed = false;

  for (const pair of jobsNode.items) {
    const jobValue = pair.value;
    if (!isMap(jobValue)) continue;
    const existing = jobValue.get("timeout-minutes", true);
    if (existing !== undefined && existing !== null) continue;

    const minutes = chooseTimeout(collectRunStrings(jobValue));
    jobValue.set("timeout-minutes", minutes);
    changed = true;
  }

  if (!changed) {
    return { filePath, original: content, patched: content, changed: false };
  }

  // Preserve the file's compact flow style and avoid line wrapping so the
  // diff shows only the genuine additions, not collateral reformatting.
  return {
    filePath,
    original: content,
    patched: doc.toString({ flowCollectionPadding: false, lineWidth: 0 }),
    changed: true,
  };
};
