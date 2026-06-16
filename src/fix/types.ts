export interface FixResult {
  readonly filePath: string;
  readonly original: string;
  readonly patched: string;
  readonly changed: boolean;
}

// A Fixer makes a whole workflow file satisfy ONE rule everywhere it applies; deterministic + idempotent (patched===original when already satisfied, changed=false).
export type Fixer = (filePath: string, content: string) => FixResult;

export interface EngineResult {
  readonly filePath: string;
  readonly original: string;
  readonly patched: string;
  readonly unifiedDiff: string;
  readonly appliedRules: readonly string[];
}

export interface FixOptions {
  readonly apply: boolean;
  readonly emitPrArtifacts: boolean;
  readonly openPr: boolean;
}
