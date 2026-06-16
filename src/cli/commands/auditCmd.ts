import type { Command } from "commander";

export function registerAudit(program: Command): void {
  program
    .command("audit [workspaces...]")
    .description("Audit one or more workspaces for CI-minute and cron waste")
    .option("--all", "Audit all registered workspaces")
    .option("--ci-only", "Check CI minutes only")
    .option("--crons-only", "Check cron schedules only")
    .option("--json", "Output report as JSON instead of Markdown")
    .action(
      async (
        workspaces: string[],
        opts: { all?: boolean; ciOnly?: boolean; cronsOnly?: boolean; json?: boolean },
      ) => {
        const { runAuditAndReport } = await import("./audit.js");
        await runAuditAndReport({
          workspaces,
          all: opts.all === true,
          flags: {
            ciOnly: opts.ciOnly === true,
            cronsOnly: opts.cronsOnly === true,
          },
          format: opts.json === true ? "json" : "markdown",
        });
      },
    );
}
