import type { Command } from "commander";
import { PROVIDER_MODULES } from "../../providers/registry.js";

export function registerProviders(program: Command): void {
  program
    .command("providers")
    .description("Show provider token status")
    .option("--check", "Check which provider tokens are present (default action)")
    .action(() => {
      const ids = Object.keys(PROVIDER_MODULES).sort();

      for (const id of ids) {
        const mod = PROVIDER_MODULES[id];
        if (mod === undefined) continue;

        if (mod.isEnabled(process.env)) {
          const firstVar = mod.tokenEnvVars.find(
            (v) => process.env[v] !== undefined && process.env[v]!.length > 0,
          );
          console.log(`${id}: token PRESENT (via ${firstVar ?? mod.tokenEnvVars[0]})`);
        } else {
          console.log(
            `${id}: token absent (set one of: ${[...mod.tokenEnvVars].join(", ")})`,
          );
        }
      }

      console.log(
        "\nTokens are read from environment / gitignored .env only; values are never displayed or logged.",
      );
    });
}
