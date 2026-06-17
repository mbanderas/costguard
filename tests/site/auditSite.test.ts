import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { Buffer } from "node:buffer";
import type { AddressInfo } from "node:net";
import { collectSiteFindings } from "../../src/checks/site/auditSite.js";

// Wiring for `audit --site`: run site checks only for workspaces that declare a
// site URL; skip (not fail) when absent or unreachable.

let server: http.Server;
let origin: string;

beforeEach(async () => {
  server = http.createServer((req, res) => {
    if ((req.url ?? "/") === "/") {
      res.setHeader("x-vercel-id", "t");
      res.setHeader("content-type", "text/html");
      res.end(`<!doctype html><html><head></head><body><img src="/big.jpg"></body></html>`);
    } else if (req.url === "/big.jpg") {
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
  await new Promise<void>((r) => server.close(() => r()));
});

describe("collectSiteFindings", () => {
  it("analyzes only targets with a site URL and labels findings by workspace", async () => {
    const findings = await collectSiteFindings([
      { workspace: "with-site", site: `${origin}/` },
      { workspace: "no-site" },
      { workspace: "blank-site", site: "" },
    ]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.workspace === "with-site")).toBe(true);
    expect(findings.every((f) => f.provider === "site")).toBe(true);
  });

  it("returns [] when no target declares a site URL", async () => {
    const findings = await collectSiteFindings([{ workspace: "a" }, { workspace: "b" }]);
    expect(findings).toEqual([]);
  });

  it("swallows an unreachable site (skip, not abort)", async () => {
    const findings = await collectSiteFindings([
      { workspace: "dead", site: "http://127.0.0.1:1/" },
      { workspace: "ok", site: `${origin}/` },
    ]);
    // the dead one is skipped; the reachable one still produces findings
    expect(findings.some((f) => f.workspace === "ok")).toBe(true);
    expect(findings.some((f) => f.workspace === "dead")).toBe(false);
  });
});
