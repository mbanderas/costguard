import type { Command } from "commander";

export function registerAudit(program: Command): void {
  program
    .command("audit [workspaces...]")
    .description("Audit one or more workspaces for CI-minute and cron waste")
    .option("--all", "Audit all registered workspaces")
    .option("--ci-only", "Check CI minutes only")
    .option("--crons-only", "Check cron schedules only")
    .option("--json", "Output report as JSON instead of Markdown")
    .option("--providers <list>", "Provider billing checks: comma-separated ids or 'all'")
    .action(
      async (
        workspaces: string[],
        opts: {
          all?: boolean;
          ciOnly?: boolean;
          cronsOnly?: boolean;
          json?: boolean;
          providers?: string;
        },
      ) => {
        const { runAuditAndReport } = await import("./audit.js");

        let providers: string[] | "all" | undefined;
        if (opts.providers !== undefined) {
          if (opts.providers === "all") {
            providers = "all";
          } else {
            providers = opts.providers
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }

        const flags =
          providers !== undefined
            ? {
                ciOnly: opts.ciOnly === true,
                cronsOnly: opts.cronsOnly === true,
                providers,
              }
            : {
                ciOnly: opts.ciOnly === true,
                cronsOnly: opts.cronsOnly === true,
              };

        await runAuditAndReport({
          workspaces,
          all: opts.all === true,
          flags,
          format: opts.json === true ? "json" : "markdown",
        });
      },
    );
}
