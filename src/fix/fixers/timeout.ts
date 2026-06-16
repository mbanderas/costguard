import { parseDocument, isMap } from "yaml";
import type { Fixer } from "../types.js";

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

    jobValue.set("timeout-minutes", 15);
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
