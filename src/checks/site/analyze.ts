import { Buffer } from "node:buffer";
import type { Finding } from "../../types.js";
import { loadSiteCosts, type SiteCosts } from "./rates.js";

// Read-only live-site cost checker. Uses Node's global fetch (GET only — no form
// submit, no credential replay, no cookies) and lightweight HTML scanning; no
// browser dependency, so it works from the zero-install bundle. Maps HTTP/HTML
// signals (transfer bytes, image weight, cache headers, compression) to host $
// using sourced knowledge/site-costs.json rates.

const GB = 1_000_000_000;
const PROVIDER = "site";

type HostKey = "vercel" | "netlify" | "cloudflare" | "unknown";

export interface SiteAnalysisOptions {
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Cap on referenced assets fetched. Default 25. */
  maxAssets?: number;
  /** Override the assumed monthly visits used for $/mo. Default from knowledge. */
  assumedMonthlyVisits?: number;
  /** Workspace label on emitted findings. Default = the URL host. */
  workspace?: string;
}

interface Resource {
  url: string;
  kind: "html" | "image" | "script" | "style";
  wireBytes: number;
  cacheControl: string | null;
  contentEncoding: string | null;
  contentType: string | null;
}

/** Analyze a live URL and return cost-relevant findings. Never throws on a bad asset. */
export async function analyzeSite(url: string, opts: SiteAnalysisOptions = {}): Promise<Finding[]> {
  const costs = loadSiteCosts();
  const doFetch = opts.fetchImpl ?? fetch;
  const maxAssets = opts.maxAssets ?? 25;
  const visits = opts.assumedMonthlyVisits ?? costs.assumedMonthlyVisits;

  const pageRes = await doFetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "accept-encoding": "br, gzip", "user-agent": "costguard-site-check" },
  });
  const pageBody = Buffer.from(await pageRes.arrayBuffer());
  const html = pageBody.toString("utf8");
  const host = detectHost(pageRes.headers);
  const workspace = opts.workspace ?? safeHost(url);

  const page: Resource = {
    url,
    kind: "html",
    wireBytes: wireBytes(pageRes.headers, pageBody.byteLength),
    cacheControl: pageRes.headers.get("cache-control"),
    contentEncoding: pageRes.headers.get("content-encoding"),
    contentType: pageRes.headers.get("content-type"),
  };

  const refs = extractAssetRefs(html, url).slice(0, maxAssets);
  const assets = await fetchAssets(doFetch, refs);
  const resources = [page, ...assets];

  const findings: Finding[] = [];
  findings.push(transferFinding(resources, host, costs, visits, workspace));
  findings.push(...imageFindings(assets, host, costs, visits, workspace));
  findings.push(...compressionFindings(resources, host, costs, visits, workspace));
  findings.push(...cacheFindings(assets, costs, workspace));
  findings.push(...renderBlockingFindings(html, url, workspace));
  return findings;
}

// --------------------------------------------------------------------------
// HTTP helpers
// --------------------------------------------------------------------------

function detectHost(headers: Headers): HostKey {
  const h = (k: string): string => (headers.get(k) ?? "").toLowerCase();
  const server = h("server");
  if (h("x-vercel-id") || h("x-vercel-cache") || server.includes("vercel")) return "vercel";
  if (h("x-nf-request-id") || server.includes("netlify")) return "netlify";
  if (h("cf-ray") || h("cf-cache-status") || server.includes("cloudflare")) return "cloudflare";
  return "unknown";
}

/** Wire (on-the-wire) byte size: prefer Content-Length, else the decoded body length. */
function wireBytes(headers: Headers, bodyLen: number): number {
  const cl = headers.get("content-length");
  const n = cl !== null ? Number(cl) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : bodyLen;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function fetchAssets(doFetch: typeof fetch, urls: string[]): Promise<Resource[]> {
  const out: Resource[] = [];
  for (const u of urls) {
    try {
      const res = await doFetch(u, {
        method: "GET",
        redirect: "follow",
        headers: { "accept-encoding": "br, gzip", "user-agent": "costguard-site-check" },
      });
      const body = Buffer.from(await res.arrayBuffer());
      out.push({
        url: u,
        kind: kindFor(u, res.headers.get("content-type")),
        wireBytes: wireBytes(res.headers, body.byteLength),
        cacheControl: res.headers.get("cache-control"),
        contentEncoding: res.headers.get("content-encoding"),
        contentType: res.headers.get("content-type"),
      });
    } catch {
      // unreachable asset — skip, never fail the whole analysis
    }
  }
  return out;
}

function kindFor(url: string, contentType: string | null): Resource["kind"] {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) return "image";
  if (ct.includes("javascript") || /\.(m?js|cjs)(\?|$)/i.test(url)) return "script";
  if (ct.includes("css") || /\.css(\?|$)/i.test(url)) return "style";
  return "script";
}

// --------------------------------------------------------------------------
// HTML scanning (no DOM; same-origin refs only)
// --------------------------------------------------------------------------

function extractAssetRefs(html: string, base: string): string[] {
  const refs = new Set<string>();
  const add = (ref: string | undefined): void => {
    const abs = ref ? sameOrigin(ref, base) : null;
    if (abs !== null) refs.add(abs);
  };
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*?>/gi)) {
    const tag = m[0];
    if (/\brel\s*=\s*["']?stylesheet/i.test(tag)) {
      const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
      add(href?.[1]);
    }
  }
  return [...refs];
}

function sameOrigin(ref: string, base: string): string | null {
  try {
    const u = new URL(ref, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin === new URL(base).origin ? u.toString() : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Finding builders
// --------------------------------------------------------------------------

function transferUsd(bytes: number, host: HostKey, costs: SiteCosts, visits: number): number {
  const rate = costs.hosts[host] ?? costs.hosts["unknown"];
  if (rate === undefined || !rate.billsTransfer) return 0;
  return (bytes / GB) * visits * rate.transferUsdPerGb;
}

function hostLabel(host: HostKey, costs: SiteCosts): string {
  return (costs.hosts[host] ?? costs.hosts["unknown"])?.label ?? host;
}

function kb(bytes: number): string {
  return `${(bytes / 1000).toFixed(0)} KB`;
}

function transferFinding(
  resources: Resource[],
  host: HostKey,
  costs: SiteCosts,
  visits: number,
  workspace: string,
): Finding {
  const total = resources.reduce((s, r) => s + r.wireBytes, 0);
  const usd = transferUsd(total, host, costs, visits);
  const billed = usd > 0;
  const severity = total > 3_000_000 ? "high" : total > 1_000_000 ? "warn" : "info";
  const costNote = billed
    ? `${hostLabel(host, costs)}: assumes ${visits.toLocaleString()} visits/mo`
    : `performance-only ($0): ${hostLabel(host, costs)} does not bill transfer`;
  return {
    workspace,
    provider: PROVIDER,
    rule: "site/transfer-weight",
    severity,
    estMonthlyUsd: usd,
    title: `Page weight ${kb(total)} across ${resources.length} request(s)`,
    detail: `Total on-the-wire transfer per page load is ${kb(total)}. ${costNote}.`,
    fix: "Trim unused JS/CSS, lazy-load below-the-fold assets, and serve right-sized images to cut transfer.",
    autofixable: false,
  };
}

function imageFindings(
  assets: Resource[],
  host: HostKey,
  costs: SiteCosts,
  visits: number,
  workspace: string,
): Finding[] {
  const limit = costs.thresholds.oversizedImageBytes;
  return assets
    .filter((a) => a.kind === "image" && a.wireBytes > limit)
    .map((a) => ({
      workspace,
      provider: PROVIDER,
      rule: "site/oversized-image",
      severity: a.wireBytes > limit * 3 ? ("high" as const) : ("warn" as const),
      estMonthlyUsd: transferUsd(a.wireBytes, host, costs, visits),
      title: `Oversized image ${kb(a.wireBytes)}`,
      detail: `${a.url} is ${kb(a.wireBytes)} (threshold ${kb(limit)}).`,
      fix: "Re-encode to WebP/AVIF, resize to the rendered dimensions, and compress.",
      autofixable: false,
    }));
}

function compressionFindings(
  resources: Resource[],
  host: HostKey,
  costs: SiteCosts,
  visits: number,
  workspace: string,
): Finding[] {
  const min = costs.thresholds.largeTextAssetBytes;
  const compressible = (r: Resource): boolean =>
    (r.kind === "html" || r.kind === "script" || r.kind === "style") &&
    r.wireBytes > min &&
    !/(br|gzip|deflate|zstd)/i.test(r.contentEncoding ?? "");
  return resources.filter(compressible).map((r) => {
    const saved = r.wireBytes * costs.compressibleSavingsRatio;
    return {
      workspace,
      provider: PROVIDER,
      rule: "site/missing-compression",
      severity: "warn" as const,
      estMonthlyUsd: transferUsd(saved, host, costs, visits),
      title: `Uncompressed ${r.kind} ${kb(r.wireBytes)}`,
      detail: `${r.url} is served without br/gzip; ~${kb(saved)} (${Math.round(
        costs.compressibleSavingsRatio * 100,
      )}%) is recoverable.`,
      fix: "Enable Brotli/gzip for text assets at the CDN/host.",
      autofixable: false,
    };
  });
}

function cacheFindings(assets: Resource[], costs: SiteCosts, workspace: string): Finding[] {
  const min = costs.thresholds.minCacheMaxAgeSeconds;
  const undercached = (r: Resource): boolean => {
    if (r.kind === "html") return false;
    const cc = (r.cacheControl ?? "").toLowerCase();
    if (cc.includes("no-store") || cc.includes("no-cache")) return true;
    const m = /max-age\s*=\s*(\d+)/.exec(cc);
    return m === null ? true : Number(m[1]) < min;
  };
  return assets.filter(undercached).map((r) => ({
    workspace,
    provider: PROVIDER,
    rule: "site/missing-cache-header",
    severity: "warn" as const,
    estMonthlyUsd: 0,
    title: `Weak cache header on static asset`,
    detail: `${r.url} cache-control is "${r.cacheControl ?? "(none)"}" — repeat visitors re-download it ($0-heuristic; repeat-visit transfer not modeled).`,
    fix: `Serve immutable static assets with Cache-Control: public, max-age=31536000, immutable.`,
    autofixable: false,
  }));
}

function renderBlockingFindings(html: string, base: string, workspace: string): Finding[] {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? "";
  const blocking: string[] = [];
  for (const m of head.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const tag = m[0];
    if (!/\b(async|defer)\b/i.test(tag)) {
      const abs = sameOrigin(m[1] ?? "", base);
      if (abs !== null) blocking.push(abs);
    }
  }
  if (blocking.length === 0) return [];
  return [
    {
      workspace,
      provider: PROVIDER,
      rule: "site/render-blocking-js",
      severity: "info" as const,
      estMonthlyUsd: 0,
      title: `${blocking.length} render-blocking script(s) in <head>`,
      detail: `Synchronous <head> scripts delay first paint ($0-heuristic; performance, not transfer): ${blocking.join(", ")}.`,
      fix: "Add `defer` (or `async`) to head scripts, or move them before </body>.",
      autofixable: false,
    },
  ];
}
