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
  question: string;
  attestationCount: number;
}

const CONDITIONS_PAGE_SIZE = 30;

// Fetch unsettled conditions with no engagement (OI=0 and no attestations) — cleanup candidates
const UNRESOLVED_NO_ENGAGEMENT_QUERY = `
query UnresolvedNoEngagement($take: Int!, $skip: Int!) {
  conditionsConnection(
    filter: {
      settled: false
      visibility: PUBLIC
      engagement: NONE
    }
    orderBy: { field: RESOLVES_AT, direction: ASC }
    first: $take
    skip: $skip
  ) {
    hasMore
    items {
      id
      openInterest
      question
      endTime
    }
  }
}
`;

// Re-check query: fetch IDs that gained engagement during safeguard wait.
// `conditionsConnection` exposes an `engagement: ANY` filter that internally
// performs the OR(openInterest != 0, attestations.some) check; restricting
// to the provided id set keeps the response small.
const CONDITIONS_WITH_ENGAGEMENT_QUERY = `
query ConditionsWithEngagement($ids: [String!]!) {
  conditionsConnection(
    filter: {
      ids: $ids
      engagement: ANY
      visibility: ALL
    }
    first: 100
  ) {
    items {
      id
    }
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
  question: string;
  _count?: { attestations: number };
}

function mapCondition(raw: RawCondition): CleanupCondition {
  return {
    id: raw.id,
    openInterest: raw.openInterest,
    question: raw.question,
    attestationCount: raw._count?.attestations ?? 0,
  };
}

async function fetchConditionsPage(
  apiUrl: string,
  take: number,
  skip: number
): Promise<{ items: CleanupCondition[]; hasMore: boolean }> {
  const response = await fetchWithRetry(`${apiUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: UNRESOLVED_NO_ENGAGEMENT_QUERY,
      variables: { take, skip },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}\n${body.slice(0, 500)}`
    );
  }

  const result = (await response.json()) as GraphQLResponse<{
    conditionsConnection: { nodes: RawCondition[]; hasMore?: boolean };
  }>;
  if (result.errors?.length) {
    throw new Error(
      `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`
    );
  }

  const page = result.data?.conditionsConnection;
  return {
    items: (page?.nodes ?? []).map(mapCondition),
    hasMore: Boolean(page?.hasMore),
  };
}

export async function fetchNoEngagementConditions(
  apiUrl: string
): Promise<CleanupCondition[]> {
  const all: CleanupCondition[] = [];
  let skip = 0;

  console.log(`Fetching unresolved no-engagement conditions from ${apiUrl}...`);

  while (true) {
    const { items, hasMore } = await fetchConditionsPage(
      apiUrl,
      CONDITIONS_PAGE_SIZE,
      skip
    );
    all.push(...items);

    if (items.length > 0) {
      console.log(`  Fetched ${all.length} conditions so far...`);
    }
    if (!hasMore) break;
    skip += CONDITIONS_PAGE_SIZE;
  }

  console.log(`Found ${all.length} unresolved no-engagement conditions`);
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
      conditionsConnection: { nodes: { id: string }[] };
    }>;
    if (result.errors?.length) {
      throw new Error(
        `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`
      );
    }

    allEngaged.push(
      ...(result.data?.conditionsConnection?.nodes ?? []).map((c) => c.id)
    );
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
        `${apiUrl}/admin/conditions/batch-private`,
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
