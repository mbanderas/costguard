import type { Command } from "commander";

export function registerDiscover(program: Command): void {
  program
    .command("discover [dir]")
    .description(
      "Detect which providers a repo uses from config files, deps, and env-var NAMES (never values)",
    )
    .option("--json", "Output detections as JSON")
    .option("--write", "Merge detected providers into ./workspaces.json (non-destructive union)")
    .action(async (dir: string | undefined, opts: { json?: boolean; write?: boolean }) => {
      const { runDiscover } = await import("./discover.js");
      await runDiscover({
        dir: dir ?? ".",
        json: opts.json === true,
        write: opts.write === true,
      });
    });
}
