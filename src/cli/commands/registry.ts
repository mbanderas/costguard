import type { Command } from "commander";
import { loadConfig, registryPath } from "../../config.js";
import { loadRegistry } from "../../registry/loader.js";
import { validateRegistry } from "../../registry/validate.js";
import { scanWorkspaces, writeRegistry } from "../../registry/init.js";

export function registerRegistry(program: Command): void {
  program
    .command("registry")
    .description("Manage the workspace registry")
    .option("--list", "List all registered workspaces and their providers")
    .option("--validate", "Validate the registry file")
    .option("--init", "Scan workspacesRoot and write a new registry")
    .action(
      async (opts: { list?: boolean; validate?: boolean; init?: boolean }) => {
        const { list, validate, init } = opts;

        // Default to --list when no option given
        if (!list && !validate && !init) {
          runList();
          return;
        }

        if (validate === true) {
          runValidate();
          return;
        }

        if (init === true) {
          await runInit();
          return;
        }

        runList();
      },
    );
}

function runList(): void {
  const registry = loadRegistry();
  const entries = Object.entries(registry.workspaces);

  if (entries.length === 0) {
    console.log("No workspaces registered. Run `costguard registry --init` to scan.");
    return;
  }

  // Determine column width for alignment
  const maxNameLen = Math.max(...entries.map(([name]) => name.length));

  for (const [name, entry] of entries) {
    const providers =
      entry.providers.length > 0 ? entry.providers.join(", ") : "(none)";
    console.log(`${name.padEnd(maxNameLen + 2)}${providers}`);
  }
}

function runValidate(): void {
  const result = validateRegistry();

  for (const err of result.errors) {
    console.log(`ERROR: ${err}`);
  }
  for (const warn of result.warnings) {
    console.log(`WARN: ${warn}`);
  }

  if (result.ok) {
    console.log(`Registry is valid (${Object.keys(loadRegistry().workspaces).length} workspaces).`);
  } else {
    console.log(`Registry validation failed with ${result.errors.length} error(s).`);
    process.exitCode = 1;
  }
}

async function runInit(): Promise<void> {
  const config = loadConfig();
  const reg = scanWorkspaces(config.workspacesRoot);
  const outPath = registryPath();
  writeRegistry(reg, outPath);

  const count = Object.keys(reg.workspaces).length;
  console.log(`Wrote ${count} workspaces to ${outPath}`);
  console.log(
    "Note: active{} blocks are blank — fill them in when you set up Half B provider billing.",
  );
}
