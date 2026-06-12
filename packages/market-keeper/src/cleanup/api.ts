/**
 * API helpers for cleanup-polymarket script
 */

import { fetchWithRetry, getAdminAuthHeaders } from '../utils';
import {
  graphqlRequest,
  graphqlUrl,
  walkConnection,
  type Connection,
} from '../utils/graphql';
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

// Cleanup candidates are unsettled public conditions with no engagement
// (OI=0 and no forecast attestations). There is no `openInterest = 0`
// server-side filter, so the walk orders by openInterest ascending and
// stops at the first non-zero row — the zero-OI prefix is exhaustive.
const NO_ENGAGEMENT_CANDIDATES_QUERY = `
query UnresolvedNoEngagement($first: Int!, $after: String, $filter: ConditionFilter) {
  conditions(
    first: $first
    after: $after
    filter: $filter
    orderBy: { field: OPEN_INTEREST, direction: ASC }
  ) {
    nodes {
      conditionId
      openInterest
      question
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

// Re-check query: which of these IDs carry open interest now. The re-check
// happens right after cleanup privated the rows, so the candidates live on
// the hidden side — but an id-filtered query is exempt from the listing's
// public-only default, so omitting `public` covers both sides in one call.
const CONDITIONS_BY_IDS_QUERY = `
query ConditionsWithEngagement($first: Int!, $filter: ConditionFilter!) {
  conditions(first: $first, filter: $filter) {
    nodes {
      conditionId
      openInterest
    }
  }
}
`;

const FORECASTS_BY_CONDITION_QUERY = `
query ForecastsByCondition($first: Int!, $after: String, $filter: ForecastFilter) {
  forecasts(first: $first, after: $after, filter: $filter) {
    nodes {
      conditionId
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

type CandidateNode = {
  conditionId: string;
  openInterest: string | number;
  question: string;
};

type ForecastNode = { conditionId: string | null };

const CHUNK_SIZE = 50;

const isZero = (openInterest: string | number): boolean =>
  BigInt(String(openInterest)) === 0n;

/**
 * Which of these condition ids carry at least one forecast attestation.
 * Paginates per chunk; cleanup candidates rarely have any, so this is
 * almost always a single page.
 */
async function fetchForecastConditionIds(
  url: string,
  conditionIds: string[]
): Promise<Set<string>> {
  const engaged = new Set<string>();
  await walkConnection<ForecastNode, { forecasts: Connection<ForecastNode> }>({
    graphqlUrl: url,
    query: FORECASTS_BY_CONDITION_QUERY,
    variables: { filter: { conditionIds } },
    label: 'Cleanup',
    select: (data) => data.forecasts,
    onPage: (nodes) => {
      for (const node of nodes) {
        if (node.conditionId) engaged.add(node.conditionId);
      }
    },
  });
  return engaged;
}

export async function fetchNoEngagementConditions(
  apiUrl: string
): Promise<CleanupCondition[]> {
  const url = graphqlUrl(apiUrl);
  const candidates: CandidateNode[] = [];

  console.log(`Fetching unresolved no-engagement conditions from ${apiUrl}...`);

  await walkConnection<
    CandidateNode,
    { conditions: Connection<CandidateNode> }
  >({
    graphqlUrl: url,
    query: NO_ENGAGEMENT_CANDIDATES_QUERY,
    variables: { filter: { public: true, settled: false } },
    label: 'Cleanup',
    select: (data) => data.conditions,
    onPage: (nodes) => {
      for (const node of nodes) {
        if (!isZero(node.openInterest)) return false; // zero-OI prefix ended
        candidates.push(node);
      }
      if (candidates.length > 0) {
        console.log(`  Fetched ${candidates.length} conditions so far...`);
      }
    },
  });

  // Drop candidates that carry forecasts — engagement the OI walk can't see.
  const withForecasts = new Set<string>();
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHUNK_SIZE);
    const engaged = await fetchForecastConditionIds(
      url,
      chunk.map((c) => c.conditionId)
    );
    for (const id of engaged) withForecasts.add(id);
  }

  const all = candidates
    .filter((c) => !withForecasts.has(c.conditionId))
    .map((c) => ({
      id: c.conditionId,
      openInterest: String(c.openInterest),
      question: c.question,
      attestationCount: 0,
    }));

  console.log(`Found ${all.length} unresolved no-engagement conditions`);
  return all;
}

export async function fetchConditionsWithEngagement(
  apiUrl: string,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];

  const url = graphqlUrl(apiUrl);
  const engaged = new Set<string>();

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);

    const data = await graphqlRequest<{
      conditions: {
        nodes: Array<Pick<CandidateNode, 'conditionId' | 'openInterest'>>;
      };
    }>(
      url,
      CONDITIONS_BY_IDS_QUERY,
      {
        first: chunk.length,
        filter: { conditionIds: chunk },
      },
      'Cleanup'
    );
    for (const node of data.conditions.nodes) {
      if (!isZero(node.openInterest)) engaged.add(node.conditionId);
    }

    const withForecasts = await fetchForecastConditionIds(url, chunk);
    for (const id of withForecasts) engaged.add(id);
  }

  return [...engaged];
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
