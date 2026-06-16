#!/usr/bin/env node
import { Command } from "commander";
import { registerAudit } from "./commands/auditCmd.js";
import { registerScan } from "./commands/scan.js";
import { registerRegistry } from "./commands/registry.js";
import { registerReport } from "./commands/report.js";

const program = new Command();

program
  .name("costguard")
  .version("0.1.0")
  .description(
    "Audit workspaces for CI-minute and cron waste (Phase 1: static/zero-credential checks)",
  );

registerAudit(program);
registerScan(program);
registerRegistry(program);
registerReport(program);

try {
  await program.parseAsync(process.argv);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exitCode = 1;
}
