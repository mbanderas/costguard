import type { Fixer } from "./types.js";
import { pathsIgnoreFixer } from "./fixers/pathsIgnore.js";
import { concurrencyFixer } from "./fixers/concurrency.js";
import { timeoutFixer } from "./fixers/timeout.js";

export const FIXER_REGISTRY: Readonly<Record<string, Fixer>> = {
  "ci/no-paths-ignore": pathsIgnoreFixer,
  "ci/no-concurrency": concurrencyFixer,
  "ci/no-timeout": timeoutFixer,
};
