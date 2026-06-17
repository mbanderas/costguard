import { parseDocument, isMap } from "yaml";
import type { Fixer } from "../types.js";

function hasAnyConcurrency(doc: ReturnType<typeof parseDocument>): boolean {
  return isMap(doc.get("concurrency", true));
}

export const concurrencyFixer: Fixer = (filePath, content) => {
  const doc = parseDocument(content);

  if (hasAnyConcurrency(doc)) {
    return { filePath, original: content, patched: content, changed: false };
  }

  doc.set("concurrency", {
    group: "ci-${{ github.workflow }}-${{ github.ref }}",
    "cancel-in-progress": true,
  });

  // Preserve the file's compact flow style and avoid line wrapping so the
  // diff shows only the genuine additions, not collateral reformatting.
  return {
    filePath,
    original: content,
    patched: doc.toString({ flowCollectionPadding: false, lineWidth: 0 }),
    changed: true,
  };
};
