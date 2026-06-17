import type { Command } from "commander";

export function registerSite(program: Command): void {
  program
    .command("site <url>")
    .description("Audit a live site for cost-relevant waste (read-only, GET-only fetch — no browser)")
    .option("--json", "Output findings as JSON instead of Markdown")
    .action(async (url: string, opts: { json?: boolean }) => {
      const { runSite } = await import("./site.js");
      await runSite({ url, json: opts.json === true });
    });
}
