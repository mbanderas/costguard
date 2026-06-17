import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolves the shipped knowledge/ data directory relative to this module's own
// location, so the same expression works across all three runtime layouts —
// each of which sits exactly two levels below the package root:
//   - src/knowledge/paths.ts   -> ../../knowledge   (vitest via tsx, on source)
//   - dist/knowledge/paths.js  -> ../../knowledge   (plain tsc build)
//   - dist/cli/index.js        -> ../../knowledge   (esbuild single-file bundle;
//       every inlined module collapses onto the bundle's import.meta.url)
// Callers therefore never need to know their own depth — the one source of truth
// for "where knowledge/ lives" is here.
const here = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(here, "..", "..", "knowledge");

/** Absolute path to a file inside the shipped knowledge/ directory. */
export function knowledgePath(name: string): string {
  return path.join(KNOWLEDGE_DIR, name);
}
