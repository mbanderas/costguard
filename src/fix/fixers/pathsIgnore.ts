import { parseDocument, isMap, isSeq } from "yaml";
import type { Fixer } from "../types.js";

const TRIGGERS = ["push", "pull_request"] as const;

function hasRequiredPathsIgnore(node: unknown): boolean {
  if (!isMap(node)) return false;
  const piNode = node.get("paths-ignore", true);
  if (!isSeq(piNode)) return false;
  return piNode.items.length > 0;
}

/** Returns true when the trigger has a non-empty `paths` allow-list. */
function hasPathsAllowList(triggerNode: ReturnType<typeof parseDocument.prototype.get>): boolean {
  if (!isMap(triggerNode)) return false;
  const pathsNode = triggerNode.get("paths", true);
  return isSeq(pathsNode) && pathsNode.items.length > 0;
}

/**
 * Returns true when the trigger is a tag-only push — it has a `tags` key but
 * no `branches` key. Paths filters are inert in this case so we must not add
 * them.
 */
function isTagOnlyPush(triggerNode: ReturnType<typeof parseDocument.prototype.get>): boolean {
  if (!isMap(triggerNode)) return false;
  const tagsNode = triggerNode.get("tags", true);
  const branchesNode = triggerNode.get("branches", true);
  return isSeq(tagsNode) && tagsNode.items.length > 0 && branchesNode === undefined;
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

    // Skip: paths allow-list is mutually exclusive with paths-ignore
    if (hasPathsAllowList(triggerNode)) continue;

    // Skip push-only: tag-only push makes paths filters inert
    if (trigger === "push" && isTagOnlyPush(triggerNode)) continue;

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
