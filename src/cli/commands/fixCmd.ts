import type { Command } from "commander";

export function registerFix(program: Command): void {
  program
    .command("fix [workspaces...]")
    .description("Auto-fix CI findings for one or more workspaces")
    .option("--all", "Fix all registered workspaces")
    .option("--apply", "Write fixes to disk (default: dry-run preview)")
    .option("--pr", "Emit PR artifacts (branch.txt, fix.patch, pr-body.md)")
    .option("--open-pr", "Open a pull request (gated; requires GITHUB_TOKEN)")
    .action(
      async (
        workspaces: string[],
        opts: {
          all?: boolean;
          apply?: boolean;
          pr?: boolean;
          openPr?: boolean;
        },
      ) => {
        if (workspaces.length === 0 && opts.all !== true) {
          console.error("Error: specify workspaces or --all");
          process.exitCode = 1;
          return;
        }

        if (opts.openPr === true) {
          const { openPrGated } = await import("../../fix/pr.js");
          const res = openPrGated({ openPr: true }, process.env);
          console.error(res.message);
          process.exitCode = 1;
          return;
        }

        const [
          { loadConfig },
          { loadRegistry },
          { resolveSelection, runAudit },
          { runFixEngine },
        ] = await Promise.all([
          import("../../config.js"),
          import("../../registry/loader.js"),
          import("../../orchestrator.js"),
          import("../../fix/engine.js"),
        ]);

        const config = loadConfig();
        const registry = loadRegistry();
        const selection = resolveSelection(registry, workspaces, opts.all === true);

        for (const ws of selection) {
          const findings = await runAudit({
            selection: [ws],
            config,
            flags: { ciOnly: true, cronsOnly: false },
          });

          const results = runFixEngine({
            findings,
            workspaceDir: ws.workspaceDir,
            apply: opts.apply === true,
          });

          if (results.length === 0) {
            console.log(`${ws.workspace}: no auto-fixable findings.`);
            continue;
          }

          if (opts.apply !== true) {
            console.log(`\n${ws.workspace}: dry-run preview (${results.length} file(s))\n`);
            for (const r of results) {
              console.log(r.unifiedDiff);
              console.log(`  rules: ${r.appliedRules.join(", ")}`);
            }
          } else {
            const ruleNames = results.flatMap((r) => r.appliedRules);
            const unique = [...new Set(ruleNames)];
            console.log(
              `${ws.workspace}: applied [${unique.join(", ")}] to ${results.length} file(s).`,
            );
          }

          if (opts.pr === true) {
            const { buildPrArtifacts, writePrArtifacts } = await import(
              "../../fix/pr.js"
            );
            const artifacts = buildPrArtifacts(ws.workspace, results, findings);
            const { dir } = writePrArtifacts(ws.workspace, artifacts);
            console.log(`${ws.workspace}: PR artifacts written to ${dir}`);
          }
        }
      },
    );
}
