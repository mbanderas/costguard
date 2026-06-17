// Per-provider detection signals (Phase B auto-discovery). Sourced from the
// 2026 dev-infra detection research (see _costguard-capabilities-loop.md
// "DISTILLED — detection env-var NAMES per provider"). Ranked signal strength:
// config file > provider package > env-var name. Host-based signals (e.g.
// neon.tech / mongodb.net inside a connection string) are intentionally OMITTED
// because confirming them requires reading an env VALUE, which is forbidden
// (R10: env KEY NAMES only, never values). Bare ambiguous deps (mongodb,
// mongoose) and generic conn names (POSTGRES_URL, DATABASE_URL) are omitted to
// avoid false positives — `discover` proposes; the human confirms.

export interface ProviderSignals {
  /** KNOWN_PROVIDERS member, or "inngest". */
  id: string;
  /** Repo-relative paths (file OR dir); existence is a match. */
  configFiles?: readonly string[];
  /** Dependency names: exact, or a "@scope/*" prefix wildcard. */
  depPackages?: readonly string[];
  /** Exact env-var NAMES (never matched against values). */
  envVars?: readonly string[];
}

/** Framework prefixes that expose a public env var under a derived name. */
export const ENV_ALIAS_PREFIXES = ["VITE_", "NEXT_PUBLIC_", "PUBLIC_", "REACT_APP_"] as const;

export const PROVIDER_SIGNALS: readonly ProviderSignals[] = [
  {
    id: "github",
    configFiles: [".github/workflows", ".github/actions", "action.yml", "action.yaml"],
    depPackages: ["@actions/core", "@actions/github", "@octokit/*"],
    envVars: ["GITHUB_TOKEN", "GH_TOKEN"],
  },
  {
    id: "supabase",
    configFiles: ["supabase/config.toml", "supabase/migrations", "supabase/functions"],
    depPackages: ["@supabase/supabase-js", "@supabase/ssr"],
    envVars: [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_DB_URL",
      "SUPABASE_PROJECT_ID",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
    ],
  },
  {
    id: "railway",
    configFiles: ["railway.json", "railway.toml"],
    depPackages: ["@railway/cli"],
    envVars: ["RAILWAY_TOKEN", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"],
  },
  {
    id: "netlify",
    configFiles: ["netlify.toml", "_headers", "_redirects", ".netlify", "netlify/functions"],
    depPackages: ["netlify-cli", "@netlify/functions", "@netlify/blobs", "@netlify/plugin-nextjs"],
    envVars: ["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID", "NETLIFY_IMAGE_CDN"],
  },
  {
    id: "neon",
    depPackages: ["@neondatabase/serverless", "@neondatabase/toolkit", "neonctl"],
    envVars: ["NEON_API_KEY"],
  },
  {
    id: "vercel",
    configFiles: ["vercel.json", ".vercel/project.json", ".vercelignore"],
    depPackages: ["vercel", "@vercel/node", "@vercel/blob", "@vercel/og"],
    envVars: ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"],
  },
  {
    id: "sentry",
    configFiles: [
      ".sentryclirc",
      "sentry.properties",
      "sentry.client.config.ts",
      "sentry.client.config.js",
      "sentry.server.config.ts",
      "sentry.server.config.js",
      "sentry.edge.config.ts",
      "sentry.edge.config.js",
    ],
    depPackages: ["@sentry/*"],
    envVars: ["SENTRY_AUTH_TOKEN", "SENTRY_DSN", "SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_URL"],
  },
  {
    id: "upstash",
    depPackages: ["@upstash/redis", "@upstash/qstash", "@upstash/vector", "@upstash/ratelimit"],
    envVars: [
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "QSTASH_TOKEN",
      "QSTASH_URL",
      "QSTASH_CURRENT_SIGNING_KEY",
      "QSTASH_NEXT_SIGNING_KEY",
      "UPSTASH_VECTOR_REST_URL",
      "UPSTASH_VECTOR_REST_TOKEN",
    ],
  },
  {
    id: "atlas",
    envVars: [
      "MONGODB_URI",
      "MONGODB_ATLAS_PUBLIC_API_KEY",
      "MONGODB_ATLAS_PRIVATE_API_KEY",
      "ATLAS_PUBLIC_KEY",
      "ATLAS_PRIVATE_KEY",
    ],
  },
  {
    id: "cloudflare",
    configFiles: ["wrangler.toml", "wrangler.json", "wrangler.jsonc", ".wrangler", "_worker.js"],
    depPackages: ["wrangler", "@cloudflare/workers-types", "miniflare", "@cloudflare/next-on-pages"],
    envVars: [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "CF_API_TOKEN",
      "CF_ACCOUNT_ID",
    ],
  },
  {
    id: "fly",
    configFiles: ["fly.toml", ".fly"],
    envVars: ["FLY_API_TOKEN"],
  },
  {
    id: "render",
    configFiles: ["render.yaml"],
    envVars: ["RENDER_API_KEY", "RENDER_SERVICE_ID"],
  },
  {
    id: "datadog",
    configFiles: ["datadog.yaml", "datadog-ci.json", "dd-trace.js"],
    depPackages: ["dd-trace", "datadog-ci", "@datadog/browser-rum", "@datadog/browser-logs"],
    envVars: ["DD_API_KEY", "DD_APP_KEY", "DD_SITE", "DD_CLIENT_TOKEN", "DATADOG_API_KEY", "DATADOG_APP_KEY"],
  },
  {
    id: "inngest",
    configFiles: ["inngest.config.ts", "inngest.config.js", "inngest.json"],
    depPackages: ["inngest", "@inngest/agent-kit"],
    envVars: ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "INNGEST_BASE_URL", "INNGEST_ENV"],
  },
];
