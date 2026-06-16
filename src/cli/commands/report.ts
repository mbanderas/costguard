import type { Command } from "commander";
import { loadLastRun } from "../../reporter/persist.js";

export function registerReport(program: Command): void {
  program
    .command("report")
    .description("Re-render a previously saved audit run")
    .option("--last", "Render the most recent saved run (default mode)")
    .option("--json", "Output as JSON instead of Markdown")
    .action(async (opts: { last?: boolean; json?: boolean }) => {
      // --last is the only mode in Phase 1; it's the implicit default
      const run = loadLastRun();

      if (run === null) {
        console.log("No previous run. Run `costguard audit` first.");
        process.exitCode = 1;
        return;
      }

      const { renderMarkdown, renderJson } = await import("../../reporter/index.js");

      const output =
        opts.json === true
          ? renderJson(run.findings, { generatedAt: run.generatedAt })
          : renderMarkdown(run.findings, { generatedAt: run.generatedAt });

      console.log(output);
    });
}
