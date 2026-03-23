/**
 * API helpers for cleanup-polymarket script
 */

import { fetchWithRetry, getAdminAuthHeaders } from '../utils';
import type {
  PublicClient,
  WalletClient,
  Transport,
  Chain,
  Account,
} from 'viem';
import { requestResolution } from '../polygon/client';

export interface CleanupCondition {
  id: string;
  openInterest: string;
  attestationCount: number;
}

const CONDITIONS_PAGE_SIZE = 30;

// Fetch expired conditions with no engagement (OI=0 and no attestations) — cleanup candidates
const EXPIRED_NO_ENGAGEMENT_QUERY = `
query ExpiredNoEngagement($now: Int!, $take: Int!, $skip: Int!) {
  conditions(
    where: {
      AND: [
        { endTime: { lt: $now } }
        { settled: { equals: false } }
        { public: { equals: true } }
        { openInterest: { equals: "0" } }
        { attestations: { none: {} } }
      ]
    }
    orderBy: { endTime: asc }
    take: $take
    skip: $skip
  ) {
    id
    openInterest
  }
}
`;

// Re-check query: fetch IDs that gained engagement during safeguard wait
// Uses filters instead of _count to avoid query complexity explosion
const CONDITIONS_WITH_ENGAGEMENT_QUERY = `
query ConditionsWithEngagement($ids: [String!]!) {
  conditions(
    where: {
      id: { in: $ids }
      OR: [
        { openInterest: { not: { equals: "0" } } }
        { attestations: { some: {} } }
      ]
    }
  ) {
    id
  }
}
`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface RawCondition {
  id: string;
  openInterest: string;
  _count?: { attestations: number };
}

function mapCondition(raw: RawCondition): CleanupCondition {
  return {
    id: raw.id,
    openInterest: raw.openInterest,
    attestationCount: raw._count?.attestations ?? 0,
  };
}

async function fetchConditionsPage(
  apiUrl: string,
  nowTimestamp: number,
  take: number,
  skip: number
): Promise<CleanupCondition[]> {
  const response = await fetchWithRetry(`${apiUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: EXPIRED_NO_ENGAGEMENT_QUERY,
      variables: { now: nowTimestamp, take, skip },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}\n${body.slice(0, 500)}`
    );
  }

  const result = (await response.json()) as GraphQLResponse<{
    conditions: RawCondition[];
  }>;
  if (result.errors?.length) {
    throw new Error(
      `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`
    );
  }

  return (result.data?.conditions ?? []).map(mapCondition);
}

export async function fetchExpiredNoEngagementConditions(
  apiUrl: string
): Promise<CleanupCondition[]> {
  const nowTimestamp = Math.floor(Date.now() / 1000);
  const all: CleanupCondition[] = [];
  let skip = 0;

  console.log(`Fetching expired unresolved conditions from ${apiUrl}...`);

  while (true) {
    const page = await fetchConditionsPage(
      apiUrl,
      nowTimestamp,
      CONDITIONS_PAGE_SIZE + 1,
      skip
    );
    const hasMore = page.length > CONDITIONS_PAGE_SIZE;
    const pageItems = hasMore ? page.slice(0, CONDITIONS_PAGE_SIZE) : page;
    all.push(...pageItems);

    if (pageItems.length > 0) {
      console.log(`  Fetched ${all.length} conditions so far...`);
    }
    if (!hasMore) break;
    skip += CONDITIONS_PAGE_SIZE;
  }

  console.log(`Found ${all.length} expired unresolved conditions`);
  return all;
}

const CHUNK_SIZE = 50;

export async function fetchConditionsWithEngagement(
  apiUrl: string,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];

  const allEngaged: string[] = [];

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const response = await fetchWithRetry(`${apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: CONDITIONS_WITH_ENGAGEMENT_QUERY,
        variables: { ids: chunk },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)');
      throw new Error(
        `GraphQL request failed: ${response.status} ${response.statusText}\n${body.slice(0, 500)}`
      );
    }

    const result = (await response.json()) as GraphQLResponse<{
      conditions: { id: string }[];
    }>;
    if (result.errors?.length) {
      throw new Error(
        `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`
      );
    }

    allEngaged.push(...(result.data?.conditions ?? []).map((c) => c.id));
  }

  return allEngaged;
}

async function batchUpdateConditions(
  apiUrl: string,
  privateKey: `0x${string}`,
  conditionIds: string[],
  update: { public?: boolean }
): Promise<{ success: boolean; updated?: number; error?: string }> {
  if (conditionIds.length === 0) return { success: true, updated: 0 };

  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);
    let totalUpdated = 0;

    for (let i = 0; i < conditionIds.length; i += CHUNK_SIZE) {
      const chunk = conditionIds.slice(i, i + CHUNK_SIZE);
      const response = await fetchWithRetry(
        `${apiUrl}/admin/conditions/batch`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ ids: chunk, update }),
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Unknown error' }));
        return {
          success: false,
          updated: totalUpdated,
          error: `HTTP ${response.status}: ${errorData.message || response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        updated: number;
        requested: number;
        found: number;
      };
      totalUpdated += data.updated;

      if (response.status === 207) {
        console.log(
          `[Cleanup] Batch partial match: requested=${data.requested}, found=${data.found}, updated=${data.updated}`
        );
      }
    }

    return { success: true, updated: totalUpdated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function privateConditions(
  apiUrl: string,
  privateKey: `0x${string}`,
  conditionIds: string[]
): Promise<{ success: boolean; updated?: number; error?: string }> {
  return batchUpdateConditions(apiUrl, privateKey, conditionIds, {
    public: false,
  });
}

export async function republishConditions(
  apiUrl: string,
  privateKey: `0x${string}`,
  conditionIds: string[]
): Promise<{ success: boolean; updated?: number; error?: string }> {
  return batchUpdateConditions(apiUrl, privateKey, conditionIds, {
    public: true,
  });
}

export async function settleConditionOnPolygon(
  polygonClient: PublicClient,
  walletClient: WalletClient<Transport, Chain, Account>,
  conditionId: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const hash = await requestResolution(
      polygonClient,
      walletClient,
      conditionId
    );
    console.log(`[${conditionId}] Settlement tx sent: ${hash}`);
    return { success: true, txHash: hash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
