import type { HttpFetcher } from "../types.js";
import {
  NeonProjectsListSchema,
  NeonBranchesResponseSchema,
  NeonProjectDetailSchema,
} from "./types.js";

const BASE = "https://console.neon.tech/api/v2";

export async function fetchProjects(
  fetcher: HttpFetcher,
): Promise<Array<{ id: string; name: string }>> {
  const res = await fetcher(`${BASE}/projects`);
  if (!res.ok) {
    throw new Error(`Neon fetchProjects HTTP ${res.status}`);
  }
  const raw = await res.json();
  const parsed = NeonProjectsListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Neon fetchProjects parse error: ${parsed.error.message}`);
  }
  return parsed.data.projects.map((p) => ({ id: p.id, name: p.name }));
}

export async function fetchBranches(
  fetcher: HttpFetcher,
  projectId: string,
): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
  const res = await fetcher(`${BASE}/projects/${projectId}/branches`);
  if (!res.ok) {
    throw new Error(`Neon fetchBranches HTTP ${res.status} for project ${projectId}`);
  }
  const raw = await res.json();
  const parsed = NeonBranchesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Neon fetchBranches parse error: ${parsed.error.message}`);
  }
  return parsed.data.branches.map((b) => ({
    id: b.id,
    name: b.name,
    isDefault: b.default === true,
  }));
}

export async function fetchComputeHours(
  fetcher: HttpFetcher,
  projectId: string,
): Promise<number> {
  const res = await fetcher(`${BASE}/projects/${projectId}`);
  if (!res.ok) {
    throw new Error(`Neon fetchComputeHours HTTP ${res.status} for project ${projectId}`);
  }
  const raw = await res.json();
  const parsed = NeonProjectDetailSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Neon fetchComputeHours parse error: ${parsed.error.message}`);
  }
  const seconds = parsed.data.compute_time_seconds ?? 0;
  return seconds / 3600;
}
