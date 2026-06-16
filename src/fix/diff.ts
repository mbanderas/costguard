import { createTwoFilesPatch } from "diff";

/** Returns a standard unified diff between original and patched content for the given file path. */
export function buildDiff(filePath: string, original: string, patched: string): string {
  return createTwoFilesPatch(filePath, filePath, original, patched);
}
