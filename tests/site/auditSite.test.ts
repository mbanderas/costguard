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

  it("analyzes multiple reachable sites concurrently (G4) — both contribute", async () => {
    // Two assetless pages on separate servers sharing one in-flight counter. Each
    // site is exactly one fetch, so cross-site concurrency is isolated: sequential
    // analysis caps in-flight at 1, parallel reaches 2.
    const state = { inFlight: 0, max: 0 };
    const make = (): Promise<{ origin: string; close: () => Promise<void> }> => {
      const s = http.createServer((req, res) => {
        state.inFlight += 1;
        state.max = Math.max(state.max, state.inFlight);
        setTimeout(() => {
          state.inFlight -= 1;
          res.setHeader("x-vercel-id", "t");
          res.setHeader("content-type", "text/html");
          res.end("<!doctype html><html><head></head><body>ok</body></html>");
        }, 40);
      });
      return new Promise((resolve) => {
        s.listen(0, "127.0.0.1", () => {
          const port = (s.address() as AddressInfo).port;
          resolve({
            origin: `http://127.0.0.1:${port}`,
            close: () => new Promise<void>((r) => s.close(() => r())),
          });
        });
      });
    };
    const a = await make();
    const b = await make();
    try {
      const findings = await collectSiteFindings([
        { workspace: "site-a", site: `${a.origin}/` },
        { workspace: "site-b", site: `${b.origin}/` },
      ]);
      expect(state.max).toBeGreaterThan(1); // sequential per-workspace would serialize to 1
      expect(findings.some((f) => f.workspace === "site-a")).toBe(true);
      expect(findings.some((f) => f.workspace === "site-b")).toBe(true);
    } finally {
      await a.close();
      await b.close();
    }
  });
});
