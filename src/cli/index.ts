#!/usr/bin/env node
import { Command } from "commander";
import { registerAudit } from "./commands/auditCmd.js";
import { registerScan } from "./commands/scan.js";
import { registerDiscover } from "./commands/discoverCmd.js";
import { registerSite } from "./commands/siteCmd.js";
import { registerRegistry } from "./commands/registry.js";
import { registerReport } from "./commands/report.js";
import { registerProviders } from "./commands/providersCmd.js";
import { registerFix } from "./commands/fixCmd.js";
import { registerDigest } from "./commands/digestCmd.js";
import { registerInstall } from "./commands/installCmd.js";

const program = new Command();

program
  .name("costguard")
  .version("0.1.0")
  .description(
    "Audit workspaces for CI/cron waste (static) and cloud spend (read-only provider billing); auto-fix CI files and render a monthly digest",
  );

registerAudit(program);
registerScan(program);
registerDiscover(program);
registerSite(program);
registerRegistry(program);
registerReport(program);
registerProviders(program);
registerFix(program);
registerDigest(program);
registerInstall(program);

try {
  await program.parseAsync(process.argv);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exitCode = 1;
}
