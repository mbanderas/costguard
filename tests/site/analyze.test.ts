import { describe, it, expect } from "vitest";
import http from "node:http";
import { Buffer } from "node:buffer";
import type { AddressInfo } from "node:net";
import { analyzeSite } from "../../src/checks/site/analyze.js";

// ---------------------------------------------------------------------------
// Phase C site checks run against a LOCAL fixture HTTP server — no live
// third-party. The analyzer is GET-only and read-only; the server records every
// request method so the test can prove no write verbs are ever sent.
// ---------------------------------------------------------------------------

interface Fixture {
  origin: string;
  methods: string[];
  close: () => Promise<void>;
}

function fixtureHandler(host: "vercel" | "cloudflare") {
  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const url = req.url ?? "/";
    if (url === "/") {
      if (host === "vercel") res.setHeader("x-vercel-id", "test");
      else res.setHeader("cf-ray", "abc123-LHR");
      res.setHeader("content-type", "text/html");
      res.end(
        `<!doctype html><html><head>` +
          `<script src="/app.js"></script>` +
          `<link rel="stylesheet" href="/styles.css">` +
          `</head><body><img src="/big.jpg"></body></html>`,
      );
    } else if (url === "/big.jpg") {
      res.setHeader("content-type", "image/jpeg");
      res.end(Buffer.alloc(700_000, 1)); // 700 KB, no cache-control
    } else if (url === "/app.js") {
      res.setHeader("content-type", "application/javascript");
      res.end(Buffer.alloc(400_000, 97)); // 400 KB text, uncompressed, no cache-control
    } else if (url === "/styles.css") {
      res.setHeader("content-type", "text/css");
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
      res.end("body{margin:0}");
    } else {
      res.statusCode = 404;
      res.end("not found");
    }
  };
}

function startServer(host: "vercel" | "cloudflare"): Promise<Fixture> {
  const methods: string[] = [];
  const handler = fixtureHandler(host);
  const server = http.createServer((req, res) => {
    methods.push(req.method ?? "");
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        methods,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe("analyzeSite — billed host (Vercel)", () => {
  it("emits the required cost classes and a sourced $/mo, GET-only", async () => {
    const fx = await startServer("vercel");
    try {
      const findings = await analyzeSite(`${fx.origin}/`);
      const rules = findings.map((f) => f.rule);

      expect(rules).toContain("site/transfer-weight");
      expect(rules).toContain("site/oversized-image");
      expect(rules).toContain("site/missing-compression");
      expect(rules).toContain("site/missing-cache-header");
      expect(rules).toContain("site/render-blocking-js");

      const transfer = findings.find((f) => f.rule === "site/transfer-weight")!;
      expect(transfer.estMonthlyUsd).toBeGreaterThan(0);
      expect(transfer.detail).toMatch(/visits\/mo/);

      // read-only: every request the analyzer made was a GET
      expect(fx.methods.length).toBeGreaterThan(0);
      expect(fx.methods.every((m) => m === "GET")).toBe(true);
    } finally {
      await fx.close();
    }
  });
});

describe("analyzeSite — free-egress host (Cloudflare Pages)", () => {
  it("tags transfer as performance-only ($0) per the core site rule", async () => {
    const fx = await startServer("cloudflare");
    try {
      const findings = await analyzeSite(`${fx.origin}/`);
      const transfer = findings.find((f) => f.rule === "site/transfer-weight")!;
      expect(transfer.estMonthlyUsd).toBe(0);
      expect(transfer.detail).toMatch(/performance-only/);
    } finally {
      await fx.close();
    }
  });
});

describe("analyzeSite — clean page", () => {
  it("a small well-cached compressed page emits no high/warn cost findings", async () => {
    const methods: string[] = [];
    const server = http.createServer((req, res) => {
      methods.push(req.method ?? "");
      res.setHeader("content-type", "text/html");
      res.setHeader("cf-ray", "x");
      res.end("<!doctype html><html><head></head><body>ok</body></html>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    try {
      const findings = await analyzeSite(`http://127.0.0.1:${port}/`);
      expect(findings.every((f) => f.severity === "info")).toBe(true);
      expect(findings.find((f) => f.rule === "site/transfer-weight")?.severity).toBe("info");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
