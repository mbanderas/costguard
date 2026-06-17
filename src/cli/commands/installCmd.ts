import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";

// One-command per-host install. A thin pass-through to scripts/install.cjs (the
// zero-dependency portable installer): commander hands off to that script so npm
// and portable users get the same `--target <host|auto>` flow as the script.
// The plugin path (Claude/Codex) copies dist/+knowledge/ only and does NOT use
// this subcommand — hence the existsSync guard for copy-only contexts.
export function registerInstall(program: Command): void {
  program
    .command("install")
    .description("Install the per-host adapter into a project (delegates to the portable installer)")
    // Let every flag reach the installer untouched: don't let commander parse,
    // validate, or intercept --help. The installer owns the option surface.
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption(false)
    .action(() => {
      const installCjsPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "scripts",
        "install.cjs",
      );

      if (!fs.existsSync(installCjsPath)) {
        console.error(
          "costguard install needs the npm package: npx -y -p @costguard/costguard-mcp costguard install --target <host|auto>",
        );
        process.exitCode = 1;
        return;
      }

      // Grab the raw args AFTER the `install` token straight from process.argv,
      // avoiding commander re-encoding drift.
      const idx = process.argv.indexOf("install");
      const rawArgs = idx >= 0 ? process.argv.slice(idx + 1) : [];

      const r = spawnSync(process.execPath, [installCjsPath, ...rawArgs], {
        stdio: "inherit",
      });
      process.exitCode = r.status ?? 1;
    });
}
