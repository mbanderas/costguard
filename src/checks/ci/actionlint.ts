import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { Finding } from "../../types.js";

const execFileAsync = promisify(execFile);

// Matches: /path/to/file.yml:10:5: some message [rule-name]
const ACTION_LINT_LINE_RE =
  /^(.+):(\d+):(\d+):\s+(.+?)\s+\[([^\]]+)\]$/;

function parseActionlintLine(
  line: string,
  workspace: string,
): Finding | undefined {
  const m = ACTION_LINT_LINE_RE.exec(line.trim());
  if (m === null) return undefined;

  const [, filePath, , , message, rule] = m;
  if (
    filePath === undefined ||
    message === undefined ||
    rule === undefined
  ) {
    return undefined;
  }

  const shortPath = path.basename(filePath);

  return {
    workspace,
    provider: "ci",
    rule: `ci/actionlint-${rule}`,
    severity: "warn",
    estMonthlyUsd: 0,
    title: `actionlint [${rule}]: ${message.slice(0, 80)}`,
    detail: `${shortPath}: ${message} [actionlint rule: ${rule}]`,
    fix: "See https://github.com/rhysd/actionlint for rule documentation.",
    autofixable: false,
  };
}

export async function runActionlint(
  workspaceDir: string,
  workspace: string,
): Promise<Finding[]> {
  // Step 1: probe for actionlint
  try {
    await execFileAsync("actionlint", ["--version"]);
  } catch (err: unknown) {
    const isEnoent =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT";

    if (isEnoent) {
      return [
        {
          workspace,
          provider: "ci",
          rule: "ci/actionlint-unavailable",
          severity: "info",
          estMonthlyUsd: 0,
          title: "actionlint not on PATH — correctness layer skipped",
          detail:
            "actionlint not on PATH; correctness layer skipped. " +
            "Install: https://github.com/rhysd/actionlint",
          fix: "Install actionlint and ensure it is on PATH.",
          autofixable: false,
          kind: "diagnostic" as const,
        },
      ];
    }

    // Some other error probing — degrade gracefully
    const msg =
      err instanceof Error ? err.message : String(err);
    return [
      {
        workspace,
        provider: "ci",
        rule: "ci/actionlint-unavailable",
        severity: "warn",
        estMonthlyUsd: 0,
        title: "actionlint probe failed",
        detail: `actionlint --version failed: ${msg}`,
        fix: "Install actionlint and ensure it is on PATH.",
        autofixable: false,
        kind: "diagnostic" as const,
      },
    ];
  }

  // Step 2: run actionlint over workflows dir
  const workflowsDir = path.join(workspaceDir, ".github", "workflows");

  try {
    const { stdout } = await execFileAsync("actionlint", [workflowsDir]);
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    const findings: Finding[] = [];
    for (const line of lines) {
      const f = parseActionlintLine(line, workspace);
      if (f !== undefined) findings.push(f);
    }
    return findings;
  } catch (err: unknown) {
    // actionlint exits non-zero when it finds issues — stdout still has results
    if (
      typeof err === "object" &&
      err !== null &&
      "stdout" in err &&
      typeof (err as { stdout: unknown }).stdout === "string"
    ) {
      const stdout = (err as { stdout: string }).stdout;
      const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
      const findings: Finding[] = [];
      for (const line of lines) {
        const f = parseActionlintLine(line, workspace);
        if (f !== undefined) findings.push(f);
      }
      if (findings.length > 0) return findings;
    }

    // Genuine failure — degrade to a warn finding
    const msg =
      err instanceof Error ? err.message : String(err);
    return [
      {
        workspace,
        provider: "ci",
        rule: "ci/actionlint-error",
        severity: "warn",
        estMonthlyUsd: 0,
        title: "actionlint run failed",
        detail: `actionlint failed: ${msg.slice(0, 200)}`,
        fix: "Check that actionlint is properly installed and the workflow files are accessible.",
        autofixable: false,
        kind: "diagnostic" as const,
      },
    ];
  }
}
