import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DigestChannel = "stdout" | "file" | "webhook";

export interface DigestDeliveryOpts {
  channel: DigestChannel;
  outPath?: string;
  post: boolean;
  env: NodeJS.ProcessEnv;
}

export interface DigestDeliveryResult {
  delivered: boolean;
  channel: DigestChannel;
  message: string;
  destination?: string;
}

// ---------------------------------------------------------------------------
// deliver
// ---------------------------------------------------------------------------

export function deliver(content: string, opts: DigestDeliveryOpts): DigestDeliveryResult {
  switch (opts.channel) {
    case "stdout": {
      process.stdout.write(content + "\n");
      return { delivered: true, channel: "stdout", message: "printed to stdout" };
    }

    case "file": {
      if (opts.outPath === undefined || opts.outPath === "") {
        return {
          delivered: false,
          channel: "file",
          message: "file channel requires an output path",
        };
      }
      const outPath = opts.outPath;
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, content, "utf8");
      return {
        delivered: true,
        channel: "file",
        message: `written to ${outPath}`,
        destination: outPath,
      };
    }

    case "webhook": {
      const url = opts.env["COSTGUARD_DIGEST_WEBHOOK"];
      if (!opts.post || url === undefined || url === "") {
        return {
          delivered: false,
          channel: "webhook",
          message:
            "--post requires BOTH the --post flag AND a non-empty COSTGUARD_DIGEST_WEBHOOK env var; nothing was posted.",
        };
      }
      const host = new URL(url).host;
      return {
        delivered: false,
        channel: "webhook",
        message: `would post ${content.length} bytes to ${host} (webhook delivery not enabled in this build).`,
        destination: host,
      };
    }
  }
}
