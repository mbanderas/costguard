import type { Command } from "commander";

export function registerScan(program: Command): void {
  program
    .command("scan")
    .description("Static-only audit across all workspaces (alias for audit --all)")
    .option("--ci", "Check CI minutes only")
    .option("--crons", "Check cron schedules only")
    .action(async (opts: { ci?: boolean; crons?: boolean }) => {
      const { runAuditAndReport } = await import("./audit.js");
      await runAuditAndReport({
        workspaces: [],
        all: true,
        flags: {
          ciOnly: opts.ci === true,
          cronsOnly: opts.crons === true,
        },
      });
    });
}
