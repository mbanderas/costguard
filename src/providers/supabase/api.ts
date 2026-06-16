import type { HttpFetcher } from "../types.js";
import {
  ProjectsListSchema,
  AddonsResponseSchema,
  BranchesListSchema,
  deriveComputeInfo,
} from "./types.js";

const BASE_URL = "https://api.supabase.com";

export interface NormalizedProject {
  ref: string;
  name: string;
  status: string;
}

export interface NormalizedCompute {
  computeSize: string;
  pitrEnabled: boolean;
}

export interface NormalizedBranch {
  name: string;
  isDefault: boolean;
}

export async function fetchProjects(
  fetcher: HttpFetcher,
): Promise<NormalizedProject[]> {
  const res = await fetcher(`${BASE_URL}/v1/projects`);
  if (!res.ok) {
    throw new Error(`fetchProjects failed: HTTP ${res.status}`);
  }

  const raw = await res.json();
  const parsed = ProjectsListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`fetchProjects parse error: ${parsed.error.message}`);
  }

  return parsed.data.map((item) => ({
    ref: (item.ref ?? item.id) as string,
    name: item.name,
    status: item.status ?? "",
  }));
}

export async function fetchCompute(
  fetcher: HttpFetcher,
  ref: string,
): Promise<NormalizedCompute> {
  const res = await fetcher(`${BASE_URL}/v1/projects/${ref}/billing/addons`);
  if (!res.ok) {
    throw new Error(`fetchCompute(${ref}) failed: HTTP ${res.status}`);
  }

  const raw = await res.json();
  const parsed = AddonsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`fetchCompute(${ref}) parse error: ${parsed.error.message}`);
  }

  return deriveComputeInfo(parsed.data);
}

export async function fetchBranches(
  fetcher: HttpFetcher,
  ref: string,
): Promise<NormalizedBranch[]> {
  const res = await fetcher(`${BASE_URL}/v1/projects/${ref}/branches`);
  if (!res.ok) {
    throw new Error(`fetchBranches(${ref}) failed: HTTP ${res.status}`);
  }

  const raw = await res.json();
  const parsed = BranchesListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`fetchBranches(${ref}) parse error: ${parsed.error.message}`);
  }

  return parsed.data.map((b) => ({
    name: b.name,
    isDefault: b.is_default ?? false,
  }));
}
