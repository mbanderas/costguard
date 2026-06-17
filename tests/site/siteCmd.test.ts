import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import { Buffer } from "node:buffer";
import type { AddressInfo } from "node:net";
import { runSite } from "../../src/cli/commands/site.js";

// `site <url>` command core, exercised against a LOCAL fixture server.

let server: http.Server;
let origin: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
const exitCodeBefore = process.exitCode;

beforeEach(async () => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/") {
      res.setHeader("x-vercel-id", "test");
      res.setHeader("content-type", "text/html");
      res.end(`<!doctype html><html><head></head><body><img src="/big.jpg"></body></html>`);
    } else if (url === "/big.jpg") {
      res.setHeader("content-type", "image/jpeg");
      res.end(Buffer.alloc(700_000, 1));
    } else {
      res.statusCode = 404;
      res.end("no");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  process.exitCode = exitCodeBefore;
  await new Promise<void>((r) => server.close(() => r()));
});

function stdout(): string {
  return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
}

describe("runSite", () => {
  it("--json emits a findings report including site rules", async () => {
    await runSite({ url: `${origin}/`, json: true });
    const parsed = JSON.parse(stdout()) as { findings: { rule: string }[] };
    const rules = parsed.findings.map((f) => f.rule);
    expect(rules).toContain("site/transfer-weight");
    expect(rules).toContain("site/oversized-image");
  });

  it("markdown mode prints a human report", async () => {
    await runSite({ url: `${origin}/`, json: false });
    expect(stdout()).toContain("CostGuard Audit Report");
  });

  it("a bad URL sets a non-zero exit code and does not throw", async () => {
    process.exitCode = 0;
    await runSite({ url: "http://127.0.0.1:1/", json: true });
    expect(process.exitCode).toBe(1);
  });
});
