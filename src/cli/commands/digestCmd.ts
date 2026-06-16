import type { Command } from "commander";

export function registerDigest(program: Command): void {
  program
    .command("digest [workspaces...]")
    .description("Generate and deliver a cost digest report")
    .option("--all", "Include all registered workspaces")
    .option("--last", "Use findings from the last audit run (no live audit)")
    .option("--json", "Output digest as JSON instead of Markdown")
    .option("--out <file>", "Write digest to a file instead of stdout")
    .option("--post", "Post digest to COSTGUARD_DIGEST_WEBHOOK (requires env var)")
    .action(
      async (
        workspaces: string[],
        opts: {
          all?: boolean;
          last?: boolean;
          json?: boolean;
          out?: string;
          post?: boolean;
        },
      ) => {
        const [
          { renderDigestMarkdown, renderDigestJson, deliver },
          { hasHighFinding },
        ] = await Promise.all([
          import("../../digest/index.js"),
          import("../../orchestrator.js"),
        ]);

        let findings: import("../../types.js").Finding[];
        let generatedAt: string;

        if (opts.last === true) {
          const { loadLastRun } = await import("../../reporter/persist.js");
          const run = loadLastRun();
          if (run === null) {
            console.error("No previous run. Run `costguard audit` first.");
            process.exitCode = 1;
            return;
          }
          findings = run.findings;
          generatedAt = run.generatedAt;
        } else {
          if (workspaces.length === 0 && opts.all !== true) {
            console.error("Error: specify workspaces, --all, or --last");
            process.exitCode = 1;
            return;
          }

          const [{ loadConfig }, { loadRegistry }, { resolveSelection, runAudit }] =
            await Promise.all([
              import("../../config.js"),
              import("../../registry/loader.js"),
              import("../../orchestrator.js"),
            ]);

          const config = loadConfig();
          const registry = loadRegistry();
          const selection = resolveSelection(registry, workspaces, opts.all === true);
          findings = await runAudit({
            selection,
            config,
            flags: { ciOnly: false, cronsOnly: false },
          });
          generatedAt = new Date().toISOString();
        }

        const period = generatedAt.slice(0, 7);
        const content =
          opts.json === true
            ? renderDigestJson(findings, { generatedAt, period })
            : renderDigestMarkdown(findings, { generatedAt, period });

        let channel: import("../../digest/delivery.js").DigestChannel;
        let outPath: string | undefined;

        if (opts.post === true) {
          channel = "webhook";
        } else if (opts.out !== undefined) {
          channel = "file";
          outPath = opts.out;
        } else {
          channel = "stdout";
        }

        const deliveryOpts: import("../../digest/delivery.js").DigestDeliveryOpts =
          outPath !== undefined
            ? { channel, outPath, post: opts.post === true, env: process.env }
            : { channel, post: opts.post === true, env: process.env };

        const result = deliver(content, deliveryOpts);

        if (channel === "file" || channel === "webhook") {
          console.log(result.message);
        }

        if (hasHighFinding(findings)) {
          process.exitCode = 1;
        }
      },
    );
}
