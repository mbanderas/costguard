import { parseDocument, isMap, isSeq, isScalar } from "yaml";
import type { Fixer } from "../types.js";

const PATHS_IGNORE_REQUIRED = ["**.md", "docs/**"] as const;
const TRIGGERS = ["push", "pull_request"] as const;

function hasRequiredPathsIgnore(node: unknown): boolean {
  if (!isMap(node)) return false;
  const piNode = node.get("paths-ignore", true);
  if (!isSeq(piNode)) return false;
  const items = piNode.items.map((item) =>
    isScalar(item) ? String(item.value) : null,
  );
  return PATHS_IGNORE_REQUIRED.every((p) => items.includes(p));
}

export const pathsIgnoreFixer: Fixer = (filePath, content) => {
  const doc = parseDocument(content);
  const onNode = doc.get("on", true);

  if (!isMap(onNode)) {
    return { filePath, original: content, patched: content, changed: false };
  }

  let changed = false;

  for (const trigger of TRIGGERS) {
    const triggerNode = onNode.get(trigger, true);
    if (!isMap(triggerNode)) continue;
    if (hasRequiredPathsIgnore(triggerNode)) continue;

    triggerNode.set("paths-ignore", ["**.md", "docs/**"]);
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
