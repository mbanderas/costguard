import { z } from "zod";

export const KNOWN_PROVIDERS = [
  "github",
  "supabase",
  "railway",
  "netlify",
  "neon",
  "vercel",
  "inngest",
  "sentry",
  "upstash",
  "atlas",
  "cloudflare",
  "fly",
  "render",
  "datadog",
] as const;

export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

const WorkspaceEntrySchema = z.object({
  providers: z.array(z.string()),
  active: z.record(z.string(), z.unknown()),
});

export const WorkspaceRegistrySchema = z.object({
  root: z.string(),
  workspaces: z.record(z.string(), WorkspaceEntrySchema),
});

export type WorkspaceEntry = z.infer<typeof WorkspaceEntrySchema>;
export type WorkspaceRegistry = z.infer<typeof WorkspaceRegistrySchema>;
