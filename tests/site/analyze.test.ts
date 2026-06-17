import { describe, it, expect } from "vitest";
import http from "node:http";
import { Buffer } from "node:buffer";
import type { AddressInfo } from "node:net";
import { analyzeSite, DETECTABLE_HOSTS } from "../../src/checks/site/analyze.js";
import { loadSiteCosts } from "../../src/checks/site/rates.js";
import { totalMonthlyUsd, hasHighFinding } from "../../src/orchestrator.js";

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

function startBigPageServer(host: "vercel" | "cloudflare"): Promise<Fixture> {
  const methods: string[] = [];
  // 3.2 MB plain body (no asset refs) > 3 MB high byte threshold. Uncompressed
  // is fine: the page becomes a warn-level missing-compression finding, which
  // does not affect the high-severity assertions under test.
  const body = Buffer.alloc(3_200_000, 120);
  const server = http.createServer((req, res) => {
    methods.push(req.method ?? "");
    if (host === "vercel") res.setHeader("x-vercel-id", "test");
    else res.setHeader("cf-ray", "abc123-LHR");
    res.setHeader("content-type", "text/html");
    res.end(body);
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

describe("analyzeSite — cost-math integrity (no double-count)", () => {
  it("transfer-weight is the sole cost line; subset findings carry $0 with detail-$", async () => {
    const fx = await startServer("vercel");
    try {
      const findings = await analyzeSite(`${fx.origin}/`);
      const transfer = findings.find((f) => f.rule === "site/transfer-weight")!;
      const image = findings.find((f) => f.rule === "site/oversized-image")!;
      const compression = findings.find((f) => f.rule === "site/missing-compression")!;

      // headline equals exactly the single transfer line — subsets are not summed
      expect(totalMonthlyUsd(findings)).toBeCloseTo(transfer.estMonthlyUsd, 9);
      expect(transfer.estMonthlyUsd).toBeGreaterThan(0);
      expect(image.estMonthlyUsd).toBe(0);
      expect(compression.estMonthlyUsd).toBe(0);
      // their $ context still lives in the detail string (sourced, not dropped)
      expect(image.detail).toMatch(/\$/);
      expect(compression.detail).toMatch(/\$/);
    } finally {
      await fx.close();
    }
  });
});

describe("analyzeSite — $0 host never fails CI (severity capped to cost)", () => {
  it("a perf-only ($0) host over the high byte threshold emits no high finding", async () => {
    const fx = await startBigPageServer("cloudflare");
    try {
      const findings = await analyzeSite(`${fx.origin}/`);
      expect(hasHighFinding(findings)).toBe(false);
      expect(findings.every((f) => f.severity !== "high")).toBe(true);
    } finally {
      await fx.close();
    }
  });

  it("a billed host over the high byte threshold still emits a high finding", async () => {
    const fx = await startBigPageServer("vercel");
    try {
      const findings = await analyzeSite(`${fx.origin}/`);
      expect(hasHighFinding(findings)).toBe(true);
      expect(findings.find((f) => f.rule === "site/transfer-weight")?.severity).toBe("high");
    } finally {
      await fx.close();
    }
  });
});

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

// A mismatched Content-Length (>> the body actually received) cannot be served by a
// real HTTP server without hanging the client, so these tests inject `fetchImpl` and
// build Response objects directly — a constructed Response preserves the header verbatim.
interface Route {
  body: Buffer;
  headers: Record<string, string>;
}
function stubFetch(routes: Record<string, Route>): typeof fetch {
  const impl = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const u = typeof input === "string" ? input : input.toString();
    const r = routes[u];
    if (r === undefined) throw new Error(`no fixture for ${u}`);
    return new Response(new Uint8Array(r.body), { headers: r.headers });
  };
  return impl as unknown as typeof fetch;
}

describe("analyzeSite — Content-Length sanity (no phantom transfer)", () => {
  it("clamps an absurd Content-Length on an uncompressed asset to the received body", async () => {
    const origin = "http://fixture.test";
    const page = `<!doctype html><html><head></head><body><img src="${origin}/huge.jpg"></body></html>`;
    const findings = await analyzeSite(`${origin}/`, {
      fetchImpl: stubFetch({
        [`${origin}/`]: {
          body: Buffer.from(page),
          headers: { "content-type": "text/html", "x-vercel-id": "t" },
        },
        [`${origin}/huge.jpg`]: {
          body: Buffer.alloc(5000, 1), // 5 KB actually received
          headers: { "content-type": "image/jpeg", "content-length": "5000000000" }, // advertises 5 GB
        },
      }),
    });
    const transfer = findings.find((f) => f.rule === "site/transfer-weight")!;
    // clamped to ~10 KB, not 5 GB → no phantom ~$375k/mo and no false "high"
    expect(transfer.severity).not.toBe("high");
    expect(transfer.estMonthlyUsd).toBeLessThan(1);
  });

  it("trusts a compressed asset's smaller Content-Length over the decoded body size", async () => {
    const origin = "http://fixture2.test";
    const page = `<!doctype html><html><head></head><body><script src="${origin}/app.js"></script></body></html>`;
    const findings = await analyzeSite(`${origin}/`, {
      fetchImpl: stubFetch({
        [`${origin}/`]: {
          body: Buffer.from(page),
          headers: { "content-type": "text/html", "x-vercel-id": "t" },
        },
        [`${origin}/app.js`]: {
          body: Buffer.alloc(2_000_000, 97), // 2 MB decoded body
          headers: {
            "content-type": "application/javascript",
            "content-encoding": "gzip",
            "content-length": "40", // tiny compressed wire size — trusted
          },
        },
      }),
    });
    const transfer = findings.find((f) => f.rule === "site/transfer-weight")!;
    // wire size = compressed Content-Length (40 B), not the 2 MB decoded body
    expect(transfer.severity).toBe("info");
    expect(transfer.estMonthlyUsd).toBeLessThan(0.01);
  });
});

describe("analyzeSite — fetchAssets concurrency (G4)", () => {
  it("fetches referenced assets concurrently, skips an unreachable one, GET-only", async () => {
    const origin = "http://conc.test";
    const refs = [0, 1, 2, 3, 4].map((i) => `${origin}/a${i}.jpg`);
    const page =
      `<!doctype html><html><head></head><body>` +
      refs.map((r) => `<img src="${r}">`).join("") +
      `</body></html>`;
    const methods: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const impl = async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      const u = typeof input === "string" ? input : input.toString();
      methods.push(init?.method ?? "GET");
      if (u.endsWith("/")) {
        return new Response(new Uint8Array(Buffer.from(page)), {
          headers: { "content-type": "text/html", "x-vercel-id": "t" },
        });
      }
      if (u.endsWith("/a4.jpg")) throw new Error("unreachable"); // skipped, never aborts
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((r) => setTimeout(r, 15)); // hold so concurrent fetches overlap
      inFlight--;
      return new Response(new Uint8Array(Buffer.alloc(1000, 1)), {
        headers: { "content-type": "image/jpeg" },
      });
    };
    const findings = await analyzeSite(`${origin}/`, { fetchImpl: impl as unknown as typeof fetch });

    expect(maxInFlight).toBeGreaterThan(1); // sequential `for…of await` would cap at 1
    const transfer = findings.find((f) => f.rule === "site/transfer-weight")!;
    expect(transfer.title).toMatch(/across 5 request\(s\)/); // page + 4 reachable; a4 skipped
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === "GET")).toBe(true); // read-only: no write verbs
  });
});

describe("site host detection ↔ cost JSON consistency (F6/G5)", () => {
  it("every billed host in site-costs.json is a host the detector can return", () => {
    const costs = loadSiteCosts();
    const billed = Object.entries(costs.hosts)
      .filter(([, rate]) => rate.billsTransfer)
      .map(([key]) => key);
    expect(billed.length).toBeGreaterThan(0); // vercel + netlify today
    for (const host of billed) {
      expect(DETECTABLE_HOSTS).toContain(host); // else a billed host would silently $0
    }
  });

  it("detects a Netlify origin and bills its transfer (the billed host is reachable)", async () => {
    const methods: string[] = [];
    const server = http.createServer((req, res) => {
      methods.push(req.method ?? "");
      res.setHeader("x-nf-request-id", "t");
      res.setHeader("content-type", "text/html");
      res.end("<!doctype html><html><head></head><body>netlify page</body></html>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    try {
      const findings = await analyzeSite(`http://127.0.0.1:${port}/`);
      const transfer = findings.find((f) => f.rule === "site/transfer-weight")!;
      expect(transfer.estMonthlyUsd).toBeGreaterThan(0); // Netlify bills transfer
      expect(transfer.detail).toMatch(/visits\/mo/); // billed cost note, not "performance-only"
      expect(methods.every((m) => m === "GET")).toBe(true);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
