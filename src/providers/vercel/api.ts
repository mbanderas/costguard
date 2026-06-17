import type { HttpFetcher } from "../types.js";
import { VercelMembersSchema, VercelDeploymentsSchema } from "./types.js";

const BASE_URL = "https://api.vercel.com";

// Roles that consume a paid deploying seat on Vercel Pro. Viewers (and other
// read-only roles) are free and excluded.
const DEPLOY_ROLES = new Set(["OWNER", "MEMBER"]);

export interface NormalizedSeatUsage {
  paidDeployingSeats: number;
  activeDeployingSeats: number;
}

/**
 * Fetch team members + recent deployments and derive seat usage: how many
 * deploy-capable seats exist versus how many actually shipped a deploy.
 */
export async function fetchSeatUsage(
  fetcher: HttpFetcher,
  teamId: string,
): Promise<NormalizedSeatUsage> {
  const membersRes = await fetcher(
    `${BASE_URL}/v2/teams/${teamId}/members?limit=100`,
  );
  if (!membersRes.ok) {
    throw new Error(`fetchSeatUsage members failed: HTTP ${membersRes.status}`);
  }
  const membersParsed = VercelMembersSchema.safeParse(await membersRes.json());
  if (!membersParsed.success) {
    throw new Error(`fetchSeatUsage members parse error: ${membersParsed.error.message}`);
  }

  const deploysRes = await fetcher(
    `${BASE_URL}/v6/deployments?teamId=${teamId}&limit=100`,
  );
  if (!deploysRes.ok) {
    throw new Error(`fetchSeatUsage deployments failed: HTTP ${deploysRes.status}`);
  }
  const deploysParsed = VercelDeploymentsSchema.safeParse(await deploysRes.json());
  if (!deploysParsed.success) {
    throw new Error(`fetchSeatUsage deployments parse error: ${deploysParsed.error.message}`);
  }

  const deployerUids = new Set<string>();
  for (const d of deploysParsed.data.deployments) {
    if (d.creator) deployerUids.add(d.creator.uid);
  }

  const deployCapable = membersParsed.data.members.filter((m) =>
    DEPLOY_ROLES.has(m.role.toUpperCase()),
  );
  const activeDeployingSeats = deployCapable.filter((m) =>
    deployerUids.has(m.uid),
  ).length;

  return {
    paidDeployingSeats: deployCapable.length,
    activeDeployingSeats,
  };
}
